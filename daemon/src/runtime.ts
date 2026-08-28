import { encodePacked, keccak256, type Address, type Hex } from "viem";
import { aggregateEpoch } from "./aggregator.js";
import { finalizedRange, dedupeBlockObservations, type BlockRange } from "./chain-watcher.js";
import { classifyTransaction } from "./classifier.js";
import { dueLifeTicks, type LifeTickCandidate } from "./life-keeper.js";
import { errorLogFields, noopLogger, type Logger } from "./logger.js";
import type { PeerObservation } from "./peer-attestation.js";
import { DaemonStore, type IndexedEvent } from "./store.js";
import "./store-operational.js";
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
  logger?: Logger;
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

function peerDigest(
  chainId: bigint,
  txHash: Hex,
  actorTokenId: bigint,
  peerTokenId: bigint,
): Hex {
  return keccak256(encodePacked(
    ["uint256", "bytes32", "uint256", "uint256"],
    [chainId, txHash, actorTokenId, peerTokenId],
  ));
}

/**
 * Implements one deterministic daemon iteration independently of any specific
 * RPC client. Network I/O is supplied through RuntimeDependencies; canonical
 * classification and the durable commit boundary live here and are testable.
 */
export class RuntimePhases {
  readonly #dependencies: RuntimeDependencies;
  readonly #logger: Logger;
  #range: BlockRange | null | undefined;
  #blocks: ObservedBlock[] = [];
  #activities = new Map<string, ClassifiedActivity[]>();
  #seenUpdates: SeenUpdate[] = [];
  #peerEncounters: PeerObservation[] = [];

  constructor(dependencies: RuntimeDependencies) {
    if (dependencies.chainId <= 0n) throw new Error("chainId must be positive");
    if (dependencies.deploymentBlock <= 0n) throw new Error("deploymentBlock must be positive");
    if (dependencies.finalityDepth < 0n) throw new Error("finalityDepth must be non-negative");
    if (dependencies.epochBlocks <= 0n) throw new Error("epochBlocks must be positive");
    if (dependencies.highGasThreshold < 0n) throw new Error("highGasThreshold must be non-negative");
    this.#dependencies = dependencies;
    this.#logger = dependencies.logger ?? noopLogger;
  }

  async syncRegistryAndIndexer(): Promise<void> {
    this.#clearWorkingState();

    const failStop = this.#dependencies.store.failStopReason();
    if (failStop !== null) {
      throw new Error(`daemon fail-stop engaged: ${failStop}`);
    }

    const head = await this.#rpc("getHeadBlock", () => this.#dependencies.getHeadBlock());
    const durableLast = this.#dependencies.store.lastProcessedBlock();
    const beforeDeployment = this.#dependencies.deploymentBlock - 1n;
    const effectiveLast = durableLast > beforeDeployment ? durableLast : beforeDeployment;
    this.#logger.info("chain_progress", {
      head,
      durableLast,
      effectiveLast,
      finalityDepth: this.#dependencies.finalityDepth,
    });

    this.#range = finalizedRange(
      effectiveLast,
      head,
      this.#dependencies.finalityDepth,
      this.#dependencies.epochBlocks,
    );
    if (this.#range === null) {
      this.#logger.info("registered_wallet_count", {
        count: this.#dependencies.store.registeredCreatures().length,
      });
      return;
    }

    this.#logger.info("epoch_opened", {
      fromBlock: this.#range.fromBlock,
      toBlock: this.#range.toBlock,
    });

    const [births, events] = await Promise.all([
      this.#rpc("getBornEvents", () => this.#dependencies.getBornEvents(this.#range!.fromBlock, this.#range!.toBlock)),
      this.#rpc("getIndexedEvents", () => this.#dependencies.getIndexedEvents(this.#range!.fromBlock, this.#range!.toBlock)),
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

    this.#logger.info("registered_wallet_count", {
      count: this.#dependencies.store.registeredCreatures().length,
    });
  }

  async processFinalizedBlocks(): Promise<void> {
    if (this.#range === undefined) {
      throw new Error("syncRegistryAndIndexer must run before processFinalizedBlocks");
    }
    if (this.#range === null) return;

    const range = this.#range;
    const fetched = await this.#rpc(
      "getBlocks",
      () => this.#dependencies.getBlocks(range.fromBlock, range.toBlock),
    );
    const blocks = dedupeBlockObservations(fetched);
    this.#assertCompleteRange(blocks, range);
    this.#assertDurableParent(blocks, range);
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
      state.counterparties.add(key);
      working.set(key, state);
      return state;
    };

    for (const block of blocks) {
      for (const tx of block.transactions) {
        if (tx.chainId !== this.#dependencies.chainId) {
          throw new Error(`observed transaction ${tx.txHash} has wrong chain id ${tx.chainId}`);
        }

        const fromCreature = creatureByWallet.get(lower(tx.from));
        const toCreature = tx.to === null ? undefined : creatureByWallet.get(lower(tx.to));
        if (fromCreature === undefined && toCreature === undefined) continue;

        const actorIsActive = fromCreature !== undefined && tx.blockNumber > fromCreature.birthBlock;
        const peerIsActive = toCreature !== undefined && tx.blockNumber > toCreature.birthBlock;
        if (
          actorIsActive
          && peerIsActive
          && fromCreature!.tokenId !== toCreature!.tokenId
          && tx.to !== null
        ) {
          this.#peerEncounters.push({
            actorWallet: fromCreature!.wallet,
            actorTokenId: fromCreature!.tokenId,
            peerWallet: toCreature!.wallet,
            peerTokenId: toCreature!.tokenId,
            chainId: this.#dependencies.chainId,
            blockNumber: tx.blockNumber,
            encounterDigest: peerDigest(
              this.#dependencies.chainId,
              tx.txHash,
              fromCreature!.tokenId,
              toCreature!.tokenId,
            ),
          });
        }

        let hasCode = false;
        if (tx.to !== null && actorIsActive) {
          hasCode = await this.#rpc(
            "destinationHasCode",
            () => this.#dependencies.destinationHasCode(tx.to!, tx.blockNumber),
            { blockNumber: tx.blockNumber, address: tx.to },
          );
        }

        const wallets = new Map<string, Address>();
        if (actorIsActive) wallets.set(lower(fromCreature!.wallet), fromCreature!.wallet);
        if (peerIsActive) wallets.set(lower(toCreature!.wallet), toCreature!.wallet);

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

    let classifiedCount = 0;
    for (const activities of this.#activities.values()) classifiedCount += activities.length;
    this.#logger.info("activities_classified", {
      classifiedCount,
      walletCount: this.#activities.size,
      peerEncounterCount: this.#peerEncounters.length,
      fromBlock: range.fromBlock,
      toBlock: range.toBlock,
    });
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
      for (const encounter of this.#peerEncounters) {
        this.#dependencies.store.putPeerEncounter(encounter);
      }
      for (const update of this.#seenUpdates) {
        if (update.kind === "counterparty") {
          this.#dependencies.store.recordCounterparty(update.wallet, update.value, update.blockNumber);
        } else if (update.kind === "contract") {
          this.#dependencies.store.recordContractDestination(update.wallet, update.value, update.blockNumber);
        } else {
          this.#dependencies.store.recordSelector(update.wallet, update.value, update.blockNumber);
        }
      }
      for (const block of this.#blocks) {
        this.#dependencies.store.recordProcessedBlock(block.number, block.hash, block.parentHash);
      }
    });

    this.#logger.info("epoch_closed", {
      fromBlock: range.fromBlock,
      toBlock: range.toBlock,
      epochCount: summaries.length,
      peerEncounterCount: this.#peerEncounters.length,
    });
  }

  async submitEpochs(): Promise<void> {
    await this.#rpc("submitPending", () => this.#dependencies.submitPending());
  }

  async runLifeKeeper(): Promise<void> {
    const [candidates, now] = await Promise.all([
      this.#rpc("getLifeCandidates", () => this.#dependencies.getLifeCandidates()),
      this.#rpc("now", () => this.#dependencies.now()),
    ]);
    for (const tokenId of dueLifeTicks(candidates, now)) {
      try {
        await this.#rpc(
          "sendLifeTick",
          () => this.#dependencies.sendLifeTick(tokenId),
          { tokenId },
        );
        this.#logger.info("keeper_tick_result", { tokenId, status: "success" });
      } catch (error) {
        this.#logger.error("keeper_tick_result", {
          tokenId,
          status: "failed",
          ...errorLogFields(error),
        });
        throw error;
      }
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

  #assertDurableParent(blocks: readonly ObservedBlock[], range: BlockRange): void {
    if (blocks.length === 0 || range.fromBlock === 0n) return;
    const previous = this.#dependencies.store.processedBlock(range.fromBlock - 1n);
    if (previous === null) return;
    const first = blocks[0]!;
    if (first.parentHash.toLowerCase() === previous.hash.toLowerCase()) return;

    const reason = `deep reorg detected at block ${first.number}: expected parent ${previous.hash}, got ${first.parentHash}`;
    this.#dependencies.store.engageFailStop(reason);
    this.#logger.error("reorg_detected", {
      blockNumber: first.number,
      expectedParentHash: previous.hash,
      observedParentHash: first.parentHash,
      failStop: true,
    });
    throw new Error(reason);
  }

  async #rpc<T>(
    operation: string,
    call: () => Promise<T>,
    context: Record<string, unknown> = {},
  ): Promise<T> {
    try {
      return await call();
    } catch (error) {
      this.#logger.error("rpc_failed", {
        operation,
        ...context,
        ...errorLogFields(error),
      });
      throw error;
    }
  }

  #clearWorkingState(): void {
    this.#range = undefined;
    this.#blocks = [];
    this.#activities.clear();
    this.#seenUpdates = [];
    this.#peerEncounters = [];
  }
}
