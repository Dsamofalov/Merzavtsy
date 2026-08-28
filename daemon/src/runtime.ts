import type { Address, Hex } from "viem";
import { aggregateEpoch } from "./aggregator.js";
import { finalizedRange, dedupeBlockObservations, type BlockRange } from "./chain-watcher.js";
import { classifyTransaction } from "./classifier.js";
import { dueLifeTicks, type LifeTickCandidate } from "./life-keeper.js";
import { DaemonStore, type IndexedEvent } from "./store.js";
import type {
  ClassifiedActivity,
  ObservedBlock,
  ObservedTransaction,
} from "./types.js";

export interface BornEvent {
  owner: Address;
  tokenId: bigint;
  birthBlock: bigint;
  txHash: Hex;
  logIndex: number;
}

export interface RuntimeDependencies {
  store: DaemonStore;
  chainId: bigint;
  deploymentBlock: bigint;
  finalityDepth: bigint;
  epochBlocks: bigint;
  highGasThreshold: bigint;
  getHeadBlock(): Promise<bigint>;
  getBornEvents(fromBlock: bigint, toBlock: bigint): Promise<readonly BornEvent[]>;
  getIndexedEvents(fromBlock: bigint, toBlock: bigint): Promise<readonly IndexedEvent[]>;
  getBlocks(fromBlock: bigint, toBlock: bigint): Promise<readonly ObservedBlock[]>;
  destinationHasCode(address: Address, blockNumber: bigint): Promise<boolean>;
  submitPending(): Promise<void>;
  getLifeCandidates(): Promise<readonly LifeTickCandidate[]>;
  sendLifeTick(tokenId: bigint): Promise<void>;
  now(): Promise<bigint>;
}

type SeenUpdate =
  | { kind: "counterparty"; wallet: Address; value: Address; blockNumber: bigint }
  | { kind: "contract"; wallet: Address; value: Address; blockNumber: bigint }
  | { kind: "selector"; wallet: Address; value: Hex; blockNumber: bigint };

interface WalletWorkingState {
  contracts: Set<string>;
  counterparties: Set<string>;
  selectors: Set<string>;
}

function lower(address: Address): string {
  return address.toLowerCase();
}

function selectorOf(input: Hex): Hex | null {
  return input.length >= 10 ? input.slice(0, 10).toLowerCase() as Hex : null;
}

/**
 * Implements one deterministic daemon iteration independently of any specific
 * RPC client. Network I/O is supplied through RuntimeDependencies; canonical
 * classification and the durable commit boundary live here and are testable.
 */
export class RuntimePhases {
  readonly #dependencies: RuntimeDependencies;
  #range: BlockRange | null | undefined;
  #blocks: ObservedBlock[] = [];
  #activities = new Map<string, ClassifiedActivity[]>();
  #seenUpdates: SeenUpdate[] = [];

  constructor(dependencies: RuntimeDependencies) {
    if (dependencies.chainId <= 0n) throw new Error("chainId must be positive");
    if (dependencies.deploymentBlock <= 0n) throw new Error("deploymentBlock must be positive");
    if (dependencies.finalityDepth < 0n) throw new Error("finalityDepth must be non-negative");
    if (dependencies.epochBlocks <= 0n) throw new Error("epochBlocks must be positive");
    if (dependencies.highGasThreshold < 0n) throw new Error("highGasThreshold must be non-negative");
    this.#dependencies = dependencies;
  }

  async syncRegistryAndIndexer(): Promise<void> {
    this.#clearWorkingState();

    const head = await this.#dependencies.getHeadBlock();
    const durableLast = this.#dependencies.store.lastProcessedBlock();
    const beforeDeployment = this.#dependencies.deploymentBlock - 1n;
    const effectiveLast = durableLast > beforeDeployment ? durableLast : beforeDeployment;
    this.#range = finalizedRange(
      effectiveLast,
      head,
      this.#dependencies.finalityDepth,
      this.#dependencies.epochBlocks,
    );
    if (this.#range === null) return;

    const [births, events] = await Promise.all([
      this.#dependencies.getBornEvents(this.#range.fromBlock, this.#range.toBlock),
      this.#dependencies.getIndexedEvents(this.#range.fromBlock, this.#range.toBlock),
    ]);

    this.#dependencies.store.transaction(() => {
      for (const birth of births) {
        if (birth.birthBlock < this.#range!.fromBlock || birth.birthBlock > this.#range!.toBlock) {
          throw new Error(`Born event outside active range at ${birth.birthBlock}`);
        }
        this.#dependencies.store.recordBirth(birth.owner, birth.tokenId, birth.birthBlock);
      }
      for (const event of events) {
        if (event.blockNumber < this.#range!.fromBlock || event.blockNumber > this.#range!.toBlock) {
          throw new Error(`indexed event outside active range at ${event.blockNumber}`);
        }
        this.#dependencies.store.recordEvent(event);
      }
    });
  }

  async processFinalizedBlocks(): Promise<void> {
    if (this.#range === undefined) {
      throw new Error("syncRegistryAndIndexer must run before processFinalizedBlocks");
    }
    if (this.#range === null) return;

    const fetched = await this.#dependencies.getBlocks(this.#range.fromBlock, this.#range.toBlock);
    const blocks = dedupeBlockObservations(fetched);
    this.#assertCompleteRange(blocks, this.#range);
    this.#blocks = blocks;

    const creatures = this.#dependencies.store.registeredCreatures();
    const creatureByWallet = new Map(creatures.map((creature) => [lower(creature.wallet), creature]));
    const working = new Map<string, WalletWorkingState>();

    const stateFor = (wallet: Address): WalletWorkingState => {
      const key = lower(wallet);
      const cached = working.get(key);
      if (cached !== undefined) return cached;
      const state: WalletWorkingState = {
        contracts: new Set(this.#dependencies.store.contractDestinations(wallet)),
        counterparties: new Set(this.#dependencies.store.counterpartiesForWallet(wallet)),
        selectors: new Set(this.#dependencies.store.selectorsForWallet(wallet)),
      };
      // Self-transfers are never "new counterparties".
      state.counterparties.add(key);
      working.set(key, state);
      return state;
    };

    for (const block of blocks) {
      for (const tx of block.transactions) {
        const fromCreature = creatureByWallet.get(lower(tx.from));
        const toCreature = tx.to === null ? undefined : creatureByWallet.get(lower(tx.to));
        if (fromCreature === undefined && toCreature === undefined) continue;

        let hasCode = false;
        if (tx.to !== null && fromCreature !== undefined && tx.blockNumber > fromCreature.birthBlock) {
          hasCode = await this.#dependencies.destinationHasCode(tx.to, tx.blockNumber);
        }

        const wallets = new Map<string, Address>();
        if (fromCreature !== undefined && tx.blockNumber > fromCreature.birthBlock) {
          wallets.set(lower(fromCreature.wallet), fromCreature.wallet);
        }
        if (toCreature !== undefined && tx.blockNumber > toCreature.birthBlock) {
          wallets.set(lower(toCreature.wallet), toCreature.wallet);
        }

        for (const wallet of wallets.values()) {
          const creature = creatureByWallet.get(lower(wallet))!;
          const walletState = stateFor(wallet);
          const peers = new Map<string, bigint>(
            creatures.map((candidate) => [lower(candidate.wallet), candidate.tokenId]),
          );
          peers.delete(lower(wallet));

          const classified = classifyTransaction(tx, {
            wallet,
            tokenId: creature.tokenId,
            registeredPeers: peers,
            knownContracts: walletState.contracts,
            seenContracts: walletState.contracts,
            seenCounterparties: walletState.counterparties,
            seenSelectors: walletState.selectors,
            highGasThreshold: this.#dependencies.highGasThreshold,
            destinationHasCode: hasCode,
          });
          if (classified.length !== 0) {
            const key = lower(wallet);
            const current = this.#activities.get(key) ?? [];
            current.push(...classified);
            this.#activities.set(key, current);
          }

          this.#trackSeenState(tx, wallet, walletState, hasCode);
        }
      }
    }
  }

  async persistEpochs(): Promise<void> {
    if (this.#range === undefined) {
      throw new Error("syncRegistryAndIndexer must run before persistEpochs");
    }
    if (this.#range === null) return;

    const range = this.#range;
    const creatures = this.#dependencies.store.registeredCreatures();
    const summaries = creatures.flatMap((creature) => {
      const activities = this.#activities.get(lower(creature.wallet)) ?? [];
      if (activities.length === 0) return [];
      return [aggregateEpoch(
        creature.wallet,
        creature.tokenId,
        this.#dependencies.chainId,
        range.fromBlock,
        range.toBlock,
        activities,
      )];
    });

    this.#dependencies.store.transaction(() => {
      for (const summary of summaries) this.#dependencies.store.putEpoch(summary);
      for (const update of this.#seenUpdates) {
        if (update.kind === "counterparty") {
          this.#dependencies.store.recordCounterparty(
            update.wallet,
            update.value,
            update.blockNumber,
          );
        } else if (update.kind === "contract") {
          this.#dependencies.store.recordContractDestination(
            update.wallet,
            update.value,
            update.blockNumber,
          );
        } else {
          this.#dependencies.store.recordSelector(
            update.wallet,
            update.value,
            update.blockNumber,
          );
        }
      }
      for (const block of this.#blocks) {
        this.#dependencies.store.recordProcessedBlock(block.number, block.hash, block.parentHash);
      }
    });
  }

  async submitEpochs(): Promise<void> {
    await this.#dependencies.submitPending();
  }

  async runLifeKeeper(): Promise<void> {
    const [candidates, now] = await Promise.all([
      this.#dependencies.getLifeCandidates(),
      this.#dependencies.now(),
    ]);
    for (const tokenId of dueLifeTicks(candidates, now)) {
      await this.#dependencies.sendLifeTick(tokenId);
    }
  }

  #trackSeenState(
    tx: ObservedTransaction,
    wallet: Address,
    state: WalletWorkingState,
    destinationHasCode: boolean,
  ): void {
    const walletKey = lower(wallet);
    const outgoing = lower(tx.from) === walletKey;
    const counterparty = outgoing ? tx.to : tx.from;
    if (counterparty !== null && lower(counterparty) !== walletKey) {
      this.#seenUpdates.push({
        kind: "counterparty",
        wallet,
        value: counterparty,
        blockNumber: tx.blockNumber,
      });
      state.counterparties.add(lower(counterparty));
    }

    if (!outgoing || tx.to === null || !destinationHasCode) return;
    this.#seenUpdates.push({
      kind: "contract",
      wallet,
      value: tx.to,
      blockNumber: tx.blockNumber,
    });
    state.contracts.add(lower(tx.to));

    const selector = selectorOf(tx.input);
    if (selector !== null) {
      this.#seenUpdates.push({
        kind: "selector",
        wallet,
        value: selector,
        blockNumber: tx.blockNumber,
      });
      state.selectors.add(selector.toLowerCase());
    }
  }

  #assertCompleteRange(blocks: readonly ObservedBlock[], range: BlockRange): void {
    const expectedCount = range.toBlock - range.fromBlock + 1n;
    if (BigInt(blocks.length) !== expectedCount) {
      throw new Error(`incomplete finalized range: expected ${expectedCount} blocks, got ${blocks.length}`);
    }
    for (let index = 0; index < blocks.length; index += 1) {
      const expected = range.fromBlock + BigInt(index);
      if (blocks[index]!.number !== expected) {
        throw new Error(`non-contiguous finalized range at block ${expected}`);
      }
      if (index > 0 && blocks[index]!.parentHash.toLowerCase() !== blocks[index - 1]!.hash.toLowerCase()) {
        throw new Error(`broken parent hash link at block ${expected}`);
      }
    }
  }

  #clearWorkingState(): void {
    this.#range = undefined;
    this.#blocks = [];
    this.#activities.clear();
    this.#seenUpdates = [];
  }
}
