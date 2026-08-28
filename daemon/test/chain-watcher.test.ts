import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Hex } from "viem";
import { dedupeBlockObservations, finalizedRange } from "../src/chain-watcher.js";
import type { ObservedBlock } from "../src/types.js";

function block(number: bigint, hashByte: string, parentByte = "00"): ObservedBlock {
  return {
    number,
    hash: `0x${hashByte.repeat(64)}` as Hex,
    parentHash: `0x${parentByte.repeat(64)}` as Hex,
    timestamp: 1_700_000_000n + number,
    transactions: [],
  };
}

describe("chain watcher finality", () => {
  it("never returns a range that reaches inside finality depth", () => {
    assert.deepEqual(finalizedRange(90n, 120n, 12n, 100n), {
      fromBlock: 91n,
      toBlock: 108n,
    });
  });

  it("returns null until a new finalized block exists", () => {
    assert.equal(finalizedRange(108n, 120n, 12n, 100n), null);
    assert.equal(finalizedRange(0n, 10n, 12n, 100n), null);
  });

  it("bounds each batch by maxBlocks", () => {
    assert.deepEqual(finalizedRange(10n, 1_000n, 12n, 25n), {
      fromBlock: 11n,
      toBlock: 35n,
    });
  });

  it("deduplicates identical observations and rejects conflicting hashes", () => {
    const unique = dedupeBlockObservations([
      block(100n, "1"),
      block(100n, "1"),
      block(101n, "2", "1"),
    ]);
    assert.deepEqual(unique.map((item) => item.number), [100n, 101n]);

    assert.throws(
      () => dedupeBlockObservations([block(100n, "1"), block(100n, "2")]),
      /conflicting block hash/i,
    );
  });
});
