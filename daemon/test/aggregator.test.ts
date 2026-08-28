import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address, Hex } from "viem";
import { aggregateEpoch } from "../src/aggregator.js";
import { ActivityCategory } from "../src/classifier.js";
import type { ClassifiedActivity } from "../src/types.js";

const WALLET = "0x1000000000000000000000000000000000000001" as Address;

function activity(
  category: ActivityCategory,
  suffix: number,
  overrides: Partial<ClassifiedActivity> = {},
): ClassifiedActivity {
  return {
    category,
    units: 1,
    blockNumber: 100n + BigInt(suffix),
    txHash: `0x${suffix.toString(16).padStart(64, "0")}` as Hex,
    ...overrides,
  };
}

describe("daemon aggregator", () => {
  it("builds deterministic epoch identity and digest independent of input order", () => {
    const activities = [
      activity(ActivityCategory.CONTRACT_CALL, 1),
      activity(ActivityCategory.NEW_CONTRACT, 2, { contract: "0x3000000000000000000000000000000000000003" as Address }),
      activity(ActivityCategory.SELECTOR_DIVERSITY, 3, { selector: "0xa9059cbb" as Hex }),
    ];

    const a = aggregateEpoch(WALLET, 1n, 31337n, 100n, 120n, activities);
    const b = aggregateEpoch(WALLET, 1n, 31337n, 100n, 120n, [...activities].reverse());

    assert.equal(a.epochId, b.epochId);
    assert.equal(a.activityDigest, b.activityDigest);
    assert.deepEqual(a.categoryCounters, b.categoryCounters);
    assert.equal(a.xpDelta, b.xpDelta);
    assert.deepEqual(a.personalityDeltas, b.personalityDeltas);
    assert.deepEqual(a.needDeltas, b.needDeltas);
  });

  it("applies diminishing returns to repeated identical categories", () => {
    const one = aggregateEpoch(
      WALLET,
      1n,
      31337n,
      100n,
      120n,
      [activity(ActivityCategory.CONTRACT_CALL, 1)],
    );
    const twenty = aggregateEpoch(
      WALLET,
      1n,
      31337n,
      100n,
      120n,
      Array.from({ length: 20 }, (_, index) => activity(ActivityCategory.CONTRACT_CALL, index + 1)),
    );

    assert.equal(one.categoryCounters[ActivityCategory.CONTRACT_CALL], 1);
    assert.equal(twenty.categoryCounters[ActivityCategory.CONTRACT_CALL], 20);
    assert.ok(twenty.xpDelta > one.xpDelta);
    assert.ok(twenty.xpDelta < one.xpDelta * 20n);
  });

  it("never emits values above ActivityOracle caps even for pathological input", () => {
    const activities: ClassifiedActivity[] = [];
    for (let category = 0; category < 10; category += 1) {
      for (let index = 0; index < 2_000; index += 1) {
        activities.push(activity(category as ActivityCategory, category * 10_000 + index));
      }
    }

    const summary = aggregateEpoch(WALLET, 1n, 31337n, 1n, 10_000n, activities);
    assert.ok(summary.xpDelta <= 10_000n);
    assert.ok(summary.personalityDeltas.every((value) => Math.abs(value) <= 1_000));
    assert.ok(summary.needDeltas.every((value) => Math.abs(value) <= 2_000));
    assert.ok(summary.categoryCounters.every((value) => value <= 1_000));
  });

  it("uses all ten counters in their canonical positions", () => {
    const activities = Array.from({ length: 10 }, (_, index) =>
      activity(index as ActivityCategory, index + 1),
    );
    const summary = aggregateEpoch(WALLET, 1n, 31337n, 100n, 110n, activities);
    assert.deepEqual(summary.categoryCounters, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });
});
