import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

const { viem, networkHelpers } = await network.create();

async function deployWorldFixture() {
  const [admin, alice] = await viem.getWalletClients();
  const merzavets = await viem.deployContract("Merzavets", [admin.account.address]);
  const world = await viem.deployContract("MerzavetsWorld", [
    merzavets.address,
    admin.account.address,
  ]);
  await merzavets.write.setWorld([world.address], { account: admin.account });
  return { admin, alice, merzavets, world };
}

describe("Merzavets world state", function () {
  it("initializes bounded genome-derived state when a creature is born", async function () {
    const { alice, merzavets, world } = await networkHelpers.loadFixture(deployWorldFixture);

    await merzavets.write.birth({ account: alice.account });
    const state = await world.read.stateOf([1n]);

    assert.equal(state.level, 1);
    assert.equal(state.stage, 0);
    assert.equal(state.hibernating, false);

    for (const value of [
      state.aggression,
      state.curiosity,
      state.sociability,
      state.greed,
      state.stability,
      state.chaos,
      state.adaptability,
      state.memoryBias,
      state.energy,
      state.mood,
      state.boredom,
      state.stress,
      state.socialNeed,
    ]) {
      assert.ok(value >= 0 && value <= 10_000, `out of bounds: ${value}`);
    }
  });

  it("uses deterministic monotonic level thresholds", async function () {
    const { world } = await networkHelpers.loadFixture(deployWorldFixture);

    assert.equal(await world.read.currentLevel([0n]), 1);
    assert.equal(await world.read.currentLevel([499n]), 1);
    assert.equal(await world.read.currentLevel([500n]), 2);
    assert.equal(await world.read.currentLevel([1_999n]), 2);
    assert.equal(await world.read.currentLevel([2_000n]), 3);
    assert.equal(await world.read.currentLevel([1_000_000_000n]), 50);
  });

  it("allows world wiring only once", async function () {
    const { admin, merzavets, world } = await networkHelpers.loadFixture(deployWorldFixture);

    await viem.assertions.revertWithCustomError(
      merzavets.write.setWorld([world.address], { account: admin.account }),
      merzavets,
      "WorldAlreadyConfigured",
    );
  });
});
