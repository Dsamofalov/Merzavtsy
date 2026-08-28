import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address, Hex } from "viem";
import { DaemonStore } from "../src/store.js";
import { submitPendingEpochs, type SignedActivity } from "../src/submitter.js";
import type { ActivityAttestation } from "../src/attestation.js";
import type { EpochSummary } from "../src/types.js";

const WALLET = "0x1000000000000000000000000000000000000001" as Address;
const EPOCH = `0x${"11".repeat(32)}` as Hex;
const TX = `0x${"aa".repeat(32)}` as Hex;

function summary(): EpochSummary {
  return {
    wallet: WALLET,
    tokenId: 1n,
    chainId: 31337n,
    fromBlock: 100n,
    toBlock: 120n,
    epochId: EPOCH,
    activityDigest: `0x${"22".repeat(32)}` as Hex,
    xpDelta: 123n,
    personalityDeltas: [0, 0, 0, 0, 0, 0, 0, 0],
    needDeltas: [0, 0, 0, 0, 0],
    categoryCounters: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };
}

function signed(nonce = 0n): SignedActivity {
  const attestation: ActivityAttestation = {
    ...summary(),
    nonce,
    deadline: 1_900_000_000n,
  };
  return { attestation, signature: `0x${"55".repeat(65)}` as Hex };
}

describe("attestation submitter", () => {
  it("persists broadcast before receipt and marks a successful epoch submitted", async () => {
    const store = new DaemonStore(":memory:");
    store.putEpoch(summary());
    const calls: string[] = [];
    try {
      const result = await submitPendingEpochs({
        store,
        sign: async (_summary, nonce) => signed(nonce),
        getNonce: async () => 0n,
        isEpochConsumed: async () => false,
        broadcast: async () => {
          calls.push("broadcast");
          return TX;
        },
        waitForReceipt: async (txHash) => {
          calls.push(`wait:${txHash}`);
          const duringWait = store.getEpoch(EPOCH);
          assert.equal(duringWait?.broadcastTxHash, TX);
          assert.equal(duringWait?.submittedTxHash, null);
          return "success";
        },
      });

      assert.deepEqual(result.map((item) => item.status), ["submitted"]);
      assert.deepEqual(calls, ["broadcast", `wait:${TX}`]);
      assert.equal(store.getEpoch(EPOCH)?.submittedTxHash, TX);
      assert.deepEqual(store.pendingEpochs(), []);
    } finally {
      store.close();
    }
  });

  it("retries transient broadcast errors with the exact same signed payload", async () => {
    const store = new DaemonStore(":memory:");
    store.putEpoch(summary());
    const signedObjects: SignedActivity[] = [];
    let attempts = 0;
    try {
      const result = await submitPendingEpochs({
        store,
        maxBroadcastAttempts: 3,
        sign: async (_summary, nonce) => {
          const value = signed(nonce);
          signedObjects.push(value);
          return value;
        },
        getNonce: async () => 7n,
        isEpochConsumed: async () => false,
        broadcast: async (value) => {
          attempts += 1;
          assert.equal(value, signedObjects[0]);
          if (attempts < 3) throw new Error("temporary rpc failure");
          return TX;
        },
        waitForReceipt: async () => "success",
      });

      assert.equal(attempts, 3);
      assert.equal(signedObjects.length, 1);
      assert.equal(signedObjects[0].attestation.nonce, 7n);
      assert.equal(result[0].status, "submitted");
    } finally {
      store.close();
    }
  });

  it("recovers after crash-after-broadcast without broadcasting a second transaction", async () => {
    const store = new DaemonStore(":memory:");
    store.putEpoch(summary());
    store.markEpochBroadcast(EPOCH, TX);
    let broadcasts = 0;
    let signs = 0;
    try {
      const result = await submitPendingEpochs({
        store,
        sign: async (_summary, nonce) => {
          signs += 1;
          return signed(nonce);
        },
        getNonce: async () => 0n,
        isEpochConsumed: async () => false,
        broadcast: async () => {
          broadcasts += 1;
          return TX;
        },
        waitForReceipt: async (txHash) => {
          assert.equal(txHash, TX);
          return "success";
        },
      });

      assert.equal(signs, 0);
      assert.equal(broadcasts, 0);
      assert.equal(result[0].status, "submitted");
      assert.equal(store.getEpoch(EPOCH)?.submittedTxHash, TX);
    } finally {
      store.close();
    }
  });

  it("marks an already-consumed epoch complete without signing or broadcasting", async () => {
    const store = new DaemonStore(":memory:");
    store.putEpoch(summary());
    let calls = 0;
    try {
      const result = await submitPendingEpochs({
        store,
        sign: async (_summary, nonce) => {
          calls += 1;
          return signed(nonce);
        },
        getNonce: async () => {
          calls += 1;
          return 0n;
        },
        isEpochConsumed: async () => true,
        broadcast: async () => {
          calls += 1;
          return TX;
        },
        waitForReceipt: async () => {
          calls += 1;
          return "success";
        },
      });

      assert.equal(calls, 0);
      assert.equal(result[0].status, "already-consumed");
      assert.equal(store.getEpoch(EPOCH)?.completed, true);
      assert.deepEqual(store.pendingEpochs(), []);
    } finally {
      store.close();
    }
  });

  it("keeps an unresolved broadcast durable when receipt lookup itself fails", async () => {
    const store = new DaemonStore(":memory:");
    store.putEpoch(summary());
    try {
      const result = await submitPendingEpochs({
        store,
        sign: async (_summary, nonce) => signed(nonce),
        getNonce: async () => 0n,
        isEpochConsumed: async () => false,
        broadcast: async () => TX,
        waitForReceipt: async () => {
          throw new Error("receipt provider unavailable");
        },
      });

      assert.equal(result[0].status, "pending-receipt");
      assert.equal(store.getEpoch(EPOCH)?.broadcastTxHash, TX);
      assert.equal(store.getEpoch(EPOCH)?.completed, false);
    } finally {
      store.close();
    }
  });
});
