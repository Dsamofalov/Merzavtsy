import { isAddress, type Address, type Hex } from "viem";
import type { BornEvent } from "./runtime.js";
import type { IndexedEvent } from "./store.js";
import type { LifeStateSnapshot } from "./runtime-wiring.js";

export interface BornLogLike {
  args: {
    tokenId?: bigint;
    owner?: string;
    birthBlock?: bigint;
  };
  blockNumber: bigint | null;
  transactionHash: string | null;
  logIndex: number | null;
}

export interface IndexedLogLike {
  address: string;
  blockNumber: bigint | null;
  transactionHash: string | null;
  logIndex: number | null;
  topics: readonly string[];
  data: string;
}

export interface LifeStateLike {
  lastLifeTickAt: bigint | number;
  hibernating: boolean;
}

function hash32(value: string | null, label: string): Hex {
  if (value === null || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${label} is required and must be bytes32`);
  }
  return value as Hex;
}

function requiredAddress(value: string | undefined, label: string): Address {
  if (value === undefined || !isAddress(value, { strict: false })) {
    throw new Error(`${label} is required and must be an address`);
  }
  return value as Address;
}

export function normalizeBornLog(log: BornLogLike): BornEvent {
  if (log.blockNumber === null) throw new Error("Born blockNumber is required");
  if (log.args.tokenId === undefined) throw new Error("Born tokenId is required");
  if (log.args.birthBlock === undefined) throw new Error("Born birthBlock is required");
  if (log.logIndex === null || !Number.isSafeInteger(log.logIndex) || log.logIndex < 0) {
    throw new Error("Born logIndex is required");
  }
  if (log.args.birthBlock !== log.blockNumber) {
    throw new Error(
      `Born birthBlock mismatch: event=${log.args.birthBlock}, log=${log.blockNumber}`,
    );
  }

  return {
    owner: requiredAddress(log.args.owner, "Born owner"),
    tokenId: log.args.tokenId,
    birthBlock: log.args.birthBlock,
    txHash: hash32(log.transactionHash, "Born transactionHash"),
    logIndex: log.logIndex,
  };
}

export function normalizeIndexedLog(log: IndexedLogLike): IndexedEvent {
  if (log.blockNumber === null) throw new Error("indexed log blockNumber is required");
  if (log.logIndex === null || !Number.isSafeInteger(log.logIndex) || log.logIndex < 0) {
    throw new Error("indexed logIndex is required");
  }
  if (!isAddress(log.address, { strict: false })) {
    throw new Error("indexed log address is invalid");
  }
  const txHash = hash32(log.transactionHash, "indexed transactionHash");
  for (const topic of log.topics) hash32(topic, "indexed topic");
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(log.data)) {
    throw new Error("indexed log data must be hex bytes");
  }

  return {
    txHash,
    logIndex: log.logIndex,
    blockNumber: log.blockNumber,
    address: log.address as Address,
    eventName: log.topics[0] ?? "anonymous",
    payload: {
      topics: [...log.topics],
      data: log.data,
    },
  };
}

export function normalizeLifeState(state: LifeStateLike): LifeStateSnapshot {
  const lastLifeTickAt = typeof state.lastLifeTickAt === "bigint"
    ? state.lastLifeTickAt
    : BigInt(state.lastLifeTickAt);
  if (lastLifeTickAt < 0n) throw new Error("lastLifeTickAt must be non-negative");
  return {
    lastLifeTickAt,
    hibernating: state.hibernating,
  };
}
