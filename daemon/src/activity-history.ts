import { keccak256, toHex, type Address, type Hex } from "viem";
import { DaemonStore } from "./store.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const HISTORY_EVENT = "__activity_observation";

export interface ActivityObservation {
  wallet: Address;
  txHash: Hex;
  blockNumber: bigint;
  timestamp: bigint;
  contract: Address | null;
}

export interface ActivityHistoryMetrics {
  transactionCount: number;
  burstCount: number;
  inactivitySeconds: bigint;
  averageGapSeconds: bigint;
  repeatedProtocolContracts: number;
}

function journalTxHash(wallet: Address): Hex {
  return keccak256(toHex(`MERZAVTSY_ACTIVITY_HISTORY_V1:${wallet.toLowerCase()}`));
}

function observations(store: DaemonStore, wallet: Address): ActivityObservation[] {
  return store.eventsForTransaction(journalTxHash(wallet))
    .filter((event) => event.eventName === HISTORY_EVENT)
    .map((event) => {
      const txHash = event.payload.txHash;
      const timestamp = event.payload.timestamp;
      const contract = event.payload.contract;
      if (typeof txHash !== "string" || typeof timestamp !== "string") {
        throw new Error("corrupt activity-history observation");
      }
      if (contract !== null && typeof contract !== "string") {
        throw new Error("corrupt activity-history contract");
      }
      return {
        wallet,
        txHash: txHash as Hex,
        blockNumber: event.blockNumber,
        timestamp: BigInt(timestamp),
        contract: contract as Address | null,
      };
    })
    .sort((a, b) => a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : a.blockNumber < b.blockNumber ? -1 : 1);
}

export function recordActivityObservation(
  store: DaemonStore,
  observation: ActivityObservation,
): boolean {
  if (observation.timestamp < 0n) throw new Error("activity timestamp must be non-negative");
  const current = observations(store, observation.wallet);
  const duplicate = current.find((item) => item.txHash.toLowerCase() === observation.txHash.toLowerCase());
  if (duplicate !== undefined) {
    if (
      duplicate.blockNumber === observation.blockNumber
      && duplicate.timestamp === observation.timestamp
      && duplicate.contract?.toLowerCase() === observation.contract?.toLowerCase()
    ) return false;
    throw new Error(`conflicting activity observation ${observation.txHash}`);
  }

  return store.recordEvent({
    txHash: journalTxHash(observation.wallet),
    logIndex: current.length,
    blockNumber: observation.blockNumber,
    address: observation.contract ?? ZERO_ADDRESS,
    eventName: HISTORY_EVENT,
    payload: {
      txHash: observation.txHash.toLowerCase(),
      timestamp: observation.timestamp.toString(),
      contract: observation.contract?.toLowerCase() ?? null,
    },
  });
}

export function activityHistoryMetrics(
  store: DaemonStore,
  wallet: Address,
  now: bigint,
): ActivityHistoryMetrics {
  if (now < 0n) throw new Error("history clock must be non-negative");
  const items = observations(store, wallet);
  if (items.length === 0) {
    return {
      transactionCount: 0,
      burstCount: 0,
      inactivitySeconds: 0n,
      averageGapSeconds: 0n,
      repeatedProtocolContracts: 0,
    };
  }

  let burstCount = 0;
  let totalGap = 0n;
  for (let index = 1; index < items.length; index += 1) {
    const gap = items[index]!.timestamp - items[index - 1]!.timestamp;
    if (gap >= 0n) totalGap += gap;
    if (gap >= 0n && gap <= 300n) burstCount += 1;
  }

  const contractCounts = new Map<string, number>();
  for (const item of items) {
    if (item.contract === null) continue;
    const key = item.contract.toLowerCase();
    contractCounts.set(key, (contractCounts.get(key) ?? 0) + 1);
  }

  const repeatedProtocolContracts = [...contractCounts.values()].filter((count) => count >= 2).length;
  const lastTimestamp = items.at(-1)!.timestamp;
  return {
    transactionCount: items.length,
    burstCount,
    inactivitySeconds: now > lastTimestamp ? now - lastTimestamp : 0n,
    averageGapSeconds: items.length <= 1 ? 0n : totalGap / BigInt(items.length - 1),
    repeatedProtocolContracts,
  };
}
