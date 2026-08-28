import type { Address, Hex } from "viem";
import type { ActivityAttestation } from "./attestation.js";
import type { BootstrapChainState } from "./bootstrap.js";
import type { PeerAttestation } from "./peer-attestation.js";
import type { BornEvent } from "./runtime.js";
import type {
  LifeStateSnapshot,
  RuntimeSubmissionGateway,
} from "./runtime-wiring.js";
import type { IndexedEvent } from "./store.js";
import type { ReceiptStatus } from "./submitter.js";
import {
  normalizeBornLog,
  normalizeIndexedLog,
  normalizeLifeState,
  type BornLogLike,
  type IndexedLogLike,
  type LifeStateLike,
} from "./viem-adapter.js";

export interface ProductionAddresses {
  identity: Address;
  world: Address;
  oracle: Address;
}

export interface ProductionIoDependencies {
  getChainId(): Promise<bigint>;
  hasCode(address: Address): Promise<boolean>;
  readIdentityWorld(): Promise<Address>;
  readWorldOracle(): Promise<Address>;
  readOracleIdentity(): Promise<Address>;
  readOracleWorld(): Promise<Address>;
  getBornLogs(fromBlock: bigint, toBlock: bigint): Promise<readonly BornLogLike[]>;
  getRawLogs(
    address: Address,
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<readonly IndexedLogLike[]>;
  activityNonce(wallet: Address): Promise<bigint>;
  peerNonce(wallet: Address): Promise<bigint>;
  epochConsumed(tokenId: bigint, epochId: Hex): Promise<boolean>;
  peerConsumed(encounterDigest: Hex): Promise<boolean>;
  submitActivity(attestation: ActivityAttestation, signature: Hex): Promise<Hex>;
  submitPeer(attestation: PeerAttestation, signature: Hex): Promise<Hex>;
  waitForReceipt(txHash: Hex): Promise<ReceiptStatus>;
  readLifeState(tokenId: bigint): Promise<LifeStateLike>;
  sendLifeTick(tokenId: bigint): Promise<Hex>;
  latestBlockTimestamp(): Promise<bigint>;
}

/**
 * Production-facing facade that converts low-level chain operations into the
 * already tested runtime interfaces. It owns no persistence or classification
 * logic and is therefore safe to replace with fake dependencies in tests.
 */
export class ProductionIo {
  readonly #addresses: ProductionAddresses;
  readonly #dependencies: ProductionIoDependencies;

  constructor(
    addresses: ProductionAddresses,
    dependencies: ProductionIoDependencies,
  ) {
    this.#addresses = addresses;
    this.#dependencies = dependencies;
  }

  async bootstrapState(): Promise<BootstrapChainState> {
    const chainId = await this.#dependencies.getChainId();
    const identityHasCode = await this.#dependencies.hasCode(this.#addresses.identity);
    const worldHasCode = await this.#dependencies.hasCode(this.#addresses.world);
    const oracleHasCode = await this.#dependencies.hasCode(this.#addresses.oracle);
    const identityWorld = await this.#dependencies.readIdentityWorld();
    const worldOracle = await this.#dependencies.readWorldOracle();
    const oracleIdentity = await this.#dependencies.readOracleIdentity();
    const oracleWorld = await this.#dependencies.readOracleWorld();

    return {
      chainId,
      identityWorld,
      worldOracle,
      oracleIdentity,
      oracleWorld,
      identityHasCode,
      worldHasCode,
      oracleHasCode,
    };
  }

  async bornEvents(fromBlock: bigint, toBlock: bigint): Promise<BornEvent[]> {
    const logs = await this.#dependencies.getBornLogs(fromBlock, toBlock);
    return logs.map(normalizeBornLog);
  }

  async indexedEvents(
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<IndexedEvent[]> {
    const events: IndexedEvent[] = [];
    for (const address of [
      this.#addresses.identity,
      this.#addresses.world,
      this.#addresses.oracle,
    ]) {
      const logs = await this.#dependencies.getRawLogs(address, fromBlock, toBlock);
      events.push(...logs.map(normalizeIndexedLog));
    }
    events.sort((left, right) => {
      if (left.blockNumber !== right.blockNumber) {
        return left.blockNumber < right.blockNumber ? -1 : 1;
      }
      if (left.txHash !== right.txHash) return left.txHash.localeCompare(right.txHash);
      return left.logIndex - right.logIndex;
    });
    return events;
  }

  submissionGateway(): RuntimeSubmissionGateway {
    return {
      activityNonce: (wallet) => this.#dependencies.activityNonce(wallet),
      peerNonce: (wallet) => this.#dependencies.peerNonce(wallet),
      epochConsumed: (tokenId, epochId) =>
        this.#dependencies.epochConsumed(tokenId, epochId),
      peerConsumed: (encounterDigest) =>
        this.#dependencies.peerConsumed(encounterDigest),
      broadcastActivity: ({ attestation, signature }) =>
        this.#dependencies.submitActivity(attestation, signature),
      broadcastPeer: ({ attestation, signature }) =>
        this.#dependencies.submitPeer(attestation, signature),
      waitForReceipt: (txHash) => this.#dependencies.waitForReceipt(txHash),
    };
  }

  async lifeState(tokenId: bigint): Promise<LifeStateSnapshot> {
    return normalizeLifeState(await this.#dependencies.readLifeState(tokenId));
  }

  async sendLifeTick(tokenId: bigint): Promise<Hex> {
    return this.#dependencies.sendLifeTick(tokenId);
  }

  async now(): Promise<bigint> {
    const timestamp = await this.#dependencies.latestBlockTimestamp();
    if (timestamp < 0n) throw new Error("latest block timestamp must be non-negative");
    return timestamp;
  }
}
