import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { Address, Hex } from "viem";
import { DaemonStore } from "../src/store.js";
import type { EpochSummary } from "../src/types.js";

const WALLET = "0x1000000000000000000000000000000000000001" as Address;
const TX_HASH = `0x${"aa".repeat(32)}` as Hex;

function summary(overrides: Partial<EpochSummary> = {}): EpochSummary {
  return {
    wallet: WALLET,
    tokenId: 1n,
    chainId: 31337n,
    fromBlock: 100n,
    toBlock: 120n,
    epochId: `0x${"11".repeat(32)}` as Hex,
    activityDigest: `0x${"22".repeat(32)}` as Hex,
    xpDelta: 123n,
    personalityDeltas: [1, 2, 3, 4, 5, 6, 7, 8],
    needDeltas: [-1, 2, -3, 4, -5],
    categoryCounters: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    ...overrides,
  };
}

describe("DaemonStore", () => {
  it("records blocks idempotently and rejects a conflicting hash for the same height", () => {
    const store = new DaemonStore(":memory:");
    try {
      assert.equal(
        store.recordProcessedBlock(100n, `0x${"01".repeat(32)}` as Hex, `0x${"00".repeat(32)}` as Hex),
        true,
      );
      assert.equal(
        store.recordProcessedBlock(100n, `0x${"01".repeat(32)}` as Hex, `0x${"00".repeat(32)}` as Hex),
        false,
      );
      assert.equal(store.lastProcessedBlock(), 100n);
      assert.throws(
        () => store.recordProcessedBlock(100n, `0x${"02".repeat(32)}` as Hex, `0x${"00".repeat(32)}` as Hex),
        /conflicting processed block/i,
      );
    } finally {
      store.close();
    }
  });

  it("persists processed blocks and submitted epochs across restart", () => {
    const directory = mkdtempSync(join(tmpdir(), "merzavtsy-store-"));
    const path = join(directory, "daemon.sqlite");
    try {
      const first = new DaemonStore(path);
      assert.equal(first.recordProcessedBlock(120n, `0x${"03".repeat(32)}` as Hex, `0x${"02".repeat(32)}` as Hex), true);
      assert.equal(first.putEpoch(summary()), true);
      first.markEpochSubmitted(summary().epochId, TX_HASH);
      first.close();

      const second = new DaemonStore(path);
      try {
        assert.equal(second.lastProcessedBlock(), 120n);
        const loaded = second.getEpoch(summary().epochId);
        assert.ok(loaded);
        assert.equal(loaded.summary.xpDelta, 123n);
        assert.equal(loaded.submittedTxHash, TX_HASH);
        assert.deepEqual(second.pendingEpochs(), []);
      } finally {
        second.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("stores an epoch once and rejects a different epoch for the same closed range", () => {
    const store = new DaemonStore(":memory:");
    try {
      assert.equal(store.putEpoch(summary()), true);
      assert.equal(store.putEpoch(summary()), false);
      assert.throws(
        () => store.putEpoch(summary({ epochId: `0x${"33".repeat(32)}` as Hex })),
        /conflicting epoch range/i,
      );
    } finally {
      store.close();
    }
  });

  it("marks submission idempotently but never rewrites a successful tx hash", () => {
    const store = new DaemonStore(":memory:");
    try {
      store.putEpoch(summary());
      assert.equal(store.markEpochSubmitted(summary().epochId, TX_HASH), true);
      assert.equal(store.markEpochSubmitted(summary().epochId, TX_HASH), false);
      assert.throws(
        () => store.markEpochSubmitted(summary().epochId, `0x${"bb".repeat(32)}` as Hex),
        /already submitted/i,
      );
    } finally {
      store.close();
    }
  });
});
