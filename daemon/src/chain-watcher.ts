import type { ObservedBlock } from "./types.js";

export interface BlockRange {
  fromBlock: bigint;
  toBlock: bigint;
}

/**
 * Return the next safe block range. The chain tip is never included: only
 * blocks at or below head-finalityDepth may be processed.
 */
export function finalizedRange(
  lastProcessedBlock: bigint,
  headBlock: bigint,
  finalityDepth: bigint,
  maxBlocks: bigint,
): BlockRange | null {
  if (lastProcessedBlock < 0n || headBlock < 0n || finalityDepth < 0n) {
    throw new Error("block values must be non-negative");
  }
  if (maxBlocks <= 0n) throw new Error("maxBlocks must be positive");
  if (headBlock < finalityDepth) return null;

  const finalizedHead = headBlock - finalityDepth;
  const fromBlock = lastProcessedBlock + 1n;
  if (fromBlock > finalizedHead) return null;

  const batchEnd = fromBlock + maxBlocks - 1n;
  const toBlock = batchEnd < finalizedHead ? batchEnd : finalizedHead;
  return { fromBlock, toBlock };
}

/**
 * Collapse exact duplicate observations while treating a second hash for the
 * same block number as a reorg/conflict signal. Persistence owns the durable
 * version of this check; this helper protects one fetched batch.
 */
export function dedupeBlockObservations(
  blocks: readonly ObservedBlock[],
): ObservedBlock[] {
  const byNumber = new Map<string, ObservedBlock>();

  for (const block of blocks) {
    const key = block.number.toString();
    const previous = byNumber.get(key);
    if (previous === undefined) {
      byNumber.set(key, block);
      continue;
    }

    if (
      previous.hash.toLowerCase() !== block.hash.toLowerCase()
      || previous.parentHash.toLowerCase() !== block.parentHash.toLowerCase()
    ) {
      throw new Error(`conflicting block hash for block ${block.number}`);
    }
  }

  return [...byNumber.values()].sort((a, b) =>
    a.number < b.number ? -1 : a.number > b.number ? 1 : 0,
  );
}
