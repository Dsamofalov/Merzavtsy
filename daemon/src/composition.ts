import type { Address, Hex, LocalAccount } from "viem";
import type { RuntimeConfig } from "./config.js";
import type { Logger } from "./logger.js";
import type { BornEvent } from "./runtime.js";
import { RuntimePhases } from "./runtime.js";
import { DaemonService } from "./service.js";
import { createRuntimeSubmitter, loadLifeCandidates, type LifeStateSnapshot, type RuntimeSubmissionGateway } from "./runtime-wiring.js";
import type { IndexedEvent } from "./store.js";
import { DaemonStore } from "./store.js";
import type { ObservedBlock } from "./types.js";

export const DEFAULT_HIGH_GAS_THRESHOLD = 150_000n;

export interface DaemonRuntimeIo {
  bornEvents(fromBlock: bigint, toBlock: bigint): Promise<readonly BornEvent[]>;
  indexedEvents(fromBlock: bigint, toBlock: bigint): Promise<readonly IndexedEvent[]>;
  submissionGateway(): RuntimeSubmissionGateway;
  lifeState(tokenId: bigint): Promise<LifeStateSnapshot>;
  sendLifeTick(tokenId: bigint): Promise<Hex>;
  now(): Promise<bigint>;
}

export interface CreateDaemonApplicationOptions {
  config: RuntimeConfig;
  deploymentBlock: bigint;
  store: DaemonStore;
  oracleSigner: LocalAccount;
  io: DaemonRuntimeIo;
  logger?: Logger;
  getHeadBlock(): Promise<bigint>;
  getBlocks(fromBlock: bigint, toBlock: bigint): Promise<readonly ObservedBlock[]>;
  destinationHasCode(address: Address, blockNumber: bigint): Promise<boolean>;
  highGasThreshold?: bigint;
}

export interface DaemonApplication {
  phases: RuntimePhases;
  service: DaemonService;
}

/**
 * Composition root for the already-tested daemon primitives. It deliberately
 * owns no network or persistence implementation details; callers inject those
 * boundaries so startup can validate the live chain before opening SQLite.
 */
export function createDaemonApplication(
  options: CreateDaemonApplicationOptions,
): DaemonApplication {
  const highGasThreshold = options.highGasThreshold ?? DEFAULT_HIGH_GAS_THRESHOLD;
  if (highGasThreshold < 0n) throw new Error("highGasThreshold must be non-negative");

  const submitPending = createRuntimeSubmitter({
    store: options.store,
    oracleAddress: options.config.oracleAddress,
    oracleSigner: options.oracleSigner,
    now: () => options.io.now(),
    gateway: options.io.submissionGateway(),
    logger: options.logger,
  });

  const phases = new RuntimePhases({
    store: options.store,
    logger: options.logger,
    chainId: options.config.chainId,
    deploymentBlock: options.deploymentBlock,
    finalityDepth: options.config.finalityDepth,
    epochBlocks: options.config.epochBlocks,
    highGasThreshold,
    minimumMeaningfulWei: options.config.minimumMeaningfulWei ?? 0n,
    getHeadBlock: options.getHeadBlock,
    getBornEvents: (fromBlock, toBlock) => options.io.bornEvents(fromBlock, toBlock),
    getIndexedEvents: (fromBlock, toBlock) => options.io.indexedEvents(fromBlock, toBlock),
    getBlocks: options.getBlocks,
    destinationHasCode: options.destinationHasCode,
    submitPending,
    getLifeCandidates: () => loadLifeCandidates(options.store, (tokenId) => options.io.lifeState(tokenId)),
    sendLifeTick: async (tokenId) => {
      await options.io.sendLifeTick(tokenId);
    },
    now: () => options.io.now(),
  });

  return {
    phases,
    service: new DaemonService(phases, options.config.pollIntervalMs),
  };
}