import type { Address, Hex } from "viem";
import { DaemonStore } from "./store.js";

const PROCESSED_META_TX = `0x${"ff".repeat(31)}f1` as Hex;
const FAIL_STOP_TX = `0x${"ff".repeat(31)}f2` as Hex;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const PROCESSED_EVENT = "__daemon_processed_block";
const FAIL_STOP_ENGAGED = "__daemon_fail_stop_engaged";
const FAIL_STOP_CLEARED = "__daemon_fail_stop_cleared";

export interface ProcessedBlockMetadata {
  hash: Hex;
  parentHash: Hex;
}

declare module "./store.js" {
  interface DaemonStore {
    processedBlock(number: bigint): ProcessedBlockMetadata | null;
    failStopReason(): string | null;
    engageFailStop(reason: string): boolean;
    clearFailStop(): boolean;
  }
}

function safeIndex(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("operational journal index outside safe integer range");
  }
  return Number(value);
}

const originalRecordProcessedBlock = DaemonStore.prototype.recordProcessedBlock;

DaemonStore.prototype.recordProcessedBlock = function recordProcessedBlockWithMetadata(
  number: bigint,
  hash: Hex,
  parentHash: Hex,
): boolean {
  const inserted = originalRecordProcessedBlock.call(this, number, hash, parentHash);
  this.recordEvent({
    txHash: PROCESSED_META_TX,
    logIndex: safeIndex(number),
    blockNumber: number,
    address: ZERO_ADDRESS,
    eventName: PROCESSED_EVENT,
    payload: { hash: hash.toLowerCase(), parentHash: parentHash.toLowerCase() },
  });
  return inserted;
};

DaemonStore.prototype.processedBlock = function processedBlock(number: bigint): ProcessedBlockMetadata | null {
  const index = safeIndex(number);
  const event = this.eventsForTransaction(PROCESSED_META_TX).find((item) => item.logIndex === index);
  if (event === undefined || event.eventName !== PROCESSED_EVENT) return null;
  const hash = event.payload.hash;
  const parentHash = event.payload.parentHash;
  if (typeof hash !== "string" || typeof parentHash !== "string") {
    throw new Error(`corrupt processed-block operational metadata at ${number}`);
  }
  return { hash: hash as Hex, parentHash: parentHash as Hex };
};

DaemonStore.prototype.failStopReason = function failStopReason(): string | null {
  const events = this.eventsForTransaction(FAIL_STOP_TX);
  const latest = events.at(-1);
  if (latest === undefined || latest.eventName === FAIL_STOP_CLEARED) return null;
  if (latest.eventName !== FAIL_STOP_ENGAGED) {
    throw new Error("corrupt daemon fail-stop operational journal");
  }
  const reason = latest.payload.reason;
  if (typeof reason !== "string" || reason.length === 0) {
    throw new Error("corrupt daemon fail-stop reason");
  }
  return reason;
};

DaemonStore.prototype.engageFailStop = function engageFailStop(reason: string): boolean {
  const normalized = reason.trim();
  if (normalized.length === 0) throw new Error("fail-stop reason must not be empty");
  const current = this.failStopReason();
  if (current !== null) {
    if (current === normalized) return false;
    throw new Error(`daemon fail-stop already engaged: ${current}`);
  }
  const events = this.eventsForTransaction(FAIL_STOP_TX);
  this.recordEvent({
    txHash: FAIL_STOP_TX,
    logIndex: events.length,
    blockNumber: this.lastProcessedBlock(),
    address: ZERO_ADDRESS,
    eventName: FAIL_STOP_ENGAGED,
    payload: { reason: normalized },
  });
  return true;
};

DaemonStore.prototype.clearFailStop = function clearFailStop(): boolean {
  if (this.failStopReason() === null) return false;
  const events = this.eventsForTransaction(FAIL_STOP_TX);
  this.recordEvent({
    txHash: FAIL_STOP_TX,
    logIndex: events.length,
    blockNumber: this.lastProcessedBlock(),
    address: ZERO_ADDRESS,
    eventName: FAIL_STOP_CLEARED,
    payload: {},
  });
  return true;
};
