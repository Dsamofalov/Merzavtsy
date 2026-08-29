import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

const { viem } = await network.create();

const STICKY_FINGERS = 1n << 5n;
const ROAD_RASH = 1n << 7n;

describe("forbidden mutation dependencies", () => {
  it("blocks Sticky Fingers when Road Rash already exists", async () => {
    const harness = await viem.deployContract("MutationRulesHarness");
    const counters = [0, 0, 0, 0, 20, 0, 0, 0, 0, 0] as const;
    const mutationCounters = [0, 0, 0, 0] as const;
    const blocked = await harness.read.evaluate([ROAD_RASH, counters, mutationCounters, 0n, 30n * 24n * 60n * 60n, 10]);
    assert.equal(blocked & STICKY_FINGERS, 0n);
  });

  it("still unlocks Sticky Fingers from repeated-contract history when the forbidden mutation is absent", async () => {
    const harness = await viem.deployContract("MutationRulesHarness");
    const counters = [0, 0, 0, 0, 20, 0, 0, 0, 0, 0] as const;
    const mutationCounters = [0, 0, 0, 0] as const;
    const allowed = await harness.read.evaluate([0n, counters, mutationCounters, 0n, 30n * 24n * 60n * 60n, 10]);
    assert.notEqual(allowed & STICKY_FINGERS, 0n);
  });
});
