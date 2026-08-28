import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address, Hex } from "viem";
import { aggregateEpoch } from "../src/aggregator.js";
import { ActivityCategory, type ClassifiedActivity } from "../src/types.js";

const wallet = "0x1111111111111111111111111111111111111111" as Address;

function hash(value: number): Hex {
  return `0x${value.toString(16).padStart(64, "0")}` as Hex;
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function generatedActivities(seed: number): ClassifiedActivity[] {
  const next = lcg(seed);
  const count = 1 + (next() % 80);
  const result: ClassifiedActivity[] = [];
  for (let i = 0; i < count; i += 1) {
    const category = next() % 10;
    result.push({
      category: category as ActivityCategory,
      units: next() % 2_500,
      blockNumber: 1_000n + BigInt(next() % 50),
      txHash: hash((seed + 1) * 10_000 + i + 1),
      ...(category === ActivityCategory.REGISTERED_PEER_CONTACT
        ? { peerTokenId: BigInt(1 + (next() % 100)) }
        : {}),
      ...(category === ActivityCategory.NEW_CONTRACT || category === ActivityCategory.REPEAT_CONTRACT
        ? { contract: `0x${(next() % 0xffffff).toString(16).padStart(40, "0")}` as Address }
        : {}),
      ...(category === ActivityCategory.SELECTOR_DIVERSITY
        ? { selector: `0x${(next() % 0xffffffff).toString(16).padStart(8, "0")}` as Hex }
        : {}),
    });
  }
  return result;
}

function assertCaps(summary: ReturnType<typeof aggregateEpoch>) {
  assert.ok(summary.xpDelta >= 0n && summary.xpDelta <= 10_000n);
  for (const delta of summary.personalityDeltas) {
    assert.ok(delta >= -1_000 && delta <= 1_000, `personality cap escaped: ${delta}`);
  }
  for (const delta of summary.needDeltas) {
    assert.ok(delta >= -2_000 && delta <= 2_000, `need cap escaped: ${delta}`);
  }
  for (const count of summary.categoryCounters) {
    assert.ok(count >= 0 && count <= 1_000, `counter cap escaped: ${count}`);
  }
}

describe("daemon generated invariants", () => {
  it("keeps deterministic aggregation and all oracle-facing values bounded across 300 generated cases", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const activities = generatedActivities(seed);
      const original = aggregateEpoch(wallet, 7n, 11155111n, 1_000n, 1_049n, activities);
      const reordered = aggregateEpoch(wallet, 7n, 11155111n, 1_000n, 1_049n, [...activities].reverse());
      const restarted = aggregateEpoch(wallet, 7n, 11155111n, 1_000n, 1_049n, activities.map((activity) => ({ ...activity })));

      assert.equal(original.epochId, reordered.epochId, `epoch identity changed for seed ${seed}`);
      assert.equal(original.epochId, restarted.epochId, `epoch identity changed after restart-like rebuild for seed ${seed}`);
      assert.equal(original.activityDigest, reordered.activityDigest, `digest depended on input order for seed ${seed}`);
      assert.equal(original.activityDigest, restarted.activityDigest, `digest changed after rebuild for seed ${seed}`);
      assert.deepEqual(original.personalityDeltas, reordered.personalityDeltas);
      assert.deepEqual(original.needDeltas, reordered.needDeltas);
      assert.deepEqual(original.categoryCounters, reordered.categoryCounters);
      assertCaps(original);
    }
  });

  it("saturates repeated activity instead of allowing linear progression farming", () => {
    for (let category = 0; category <= ActivityCategory.SELECTOR_DIVERSITY; category += 1) {
      const low = aggregateEpoch(wallet, 1n, 1n, 1n, 1n, [{
        category: category as ActivityCategory,
        units: 20,
        blockNumber: 1n,
        txHash: hash(10_000 + category),
      }]);
      const spam = aggregateEpoch(wallet, 1n, 1n, 1n, 1n, [{
        category: category as ActivityCategory,
        units: 1_000_000,
        blockNumber: 1n,
        txHash: hash(20_000 + category),
      }]);

      assert.equal(spam.xpDelta, low.xpDelta, `XP kept scaling after saturation for category ${category}`);
      assertCaps(spam);
    }
  });
});
