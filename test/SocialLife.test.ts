import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

const { viem, networkHelpers } = await network.create();

async function fixture() {
  const [admin, alice, bob, outsider, keeper] = await viem.getWalletClients();
  const merzavets = await viem.deployContract("Merzavets", [admin.account.address]);
  const world = await viem.deployContract("MerzavetsWorld", [merzavets.address, admin.account.address]);
  await merzavets.write.setWorld([world.address], { account: admin.account });
  await merzavets.write.birth({ account: alice.account });
  await merzavets.write.birth({ account: bob.account });
  return { admin, alice, bob, outsider, keeper, merzavets, world };
}

describe("Merzavets social life", function () {
  it("creates directional bounded relationships from explicit social actions", async function () {
    const { alice, world } = await networkHelpers.loadFixture(fixture);

    await world.write.socialize([1n, 2n, 1], { account: alice.account }); // MOCK

    const forward = await world.read.relationshipOf([1n, 2n]);
    const reverse = await world.read.relationshipOf([2n, 1n]);

    assert.ok(forward.affinity < 0);
    assert.ok(forward.rivalry > 0);
    assert.equal(forward.interactionCount, 1);
    assert.equal(reverse.interactionCount, 0);

    for (const value of [forward.fear, forward.respect, forward.envy, forward.rivalry]) {
      assert.ok(value >= 0 && value <= 10_000);
    }
    assert.ok(forward.affinity >= -10_000 && forward.affinity <= 10_000);
    assert.ok(forward.trust >= -10_000 && forward.trust <= 10_000);
  });

  it("allows only the creature owner to initiate social actions and enforces pair cooldown", async function () {
    const { alice, outsider, world } = await networkHelpers.loadFixture(fixture);

    await viem.assertions.revertWithCustomError(
      world.write.socialize([1n, 2n, 0], { account: outsider.account }),
      world,
      "NotCreatureOwner",
    );

    await world.write.socialize([1n, 2n, 0], { account: alice.account });
    await viem.assertions.revertWithCustomError(
      world.write.socialize([1n, 2n, 0], { account: alice.account }),
      world,
      "SocialCooldown",
    );
  });

  it("runs deterministic bounded autonomous life only after cooldown", async function () {
    const { keeper, world } = await networkHelpers.loadFixture(fixture);

    await viem.assertions.revertWithCustomError(
      world.write.lifeTick([1n], { account: keeper.account }),
      world,
      "LifeTickCooldown",
    );

    await networkHelpers.time.increase(6 * 60 * 60 + 1);
    await world.write.lifeTick([1n], { account: keeper.account });

    const state = await world.read.stateOf([1n]);
    const intent = await world.read.lastLifeIntent([1n]);
    assert.equal(await world.read.lifeActionCount([1n]), 1);
    assert.ok(intent >= 0 && intent <= 5);
    for (const value of [state.energy, state.mood, state.boredom, state.stress, state.socialNeed]) {
      assert.ok(value >= 0 && value <= 10_000);
    }

    await viem.assertions.revertWithCustomError(
      world.write.lifeTick([1n], { account: keeper.account }),
      world,
      "LifeTickCooldown",
    );
  });

  it("suppresses social autonomous intent while hibernating", async function () {
    const { keeper, world } = await networkHelpers.loadFixture(fixture);

    await networkHelpers.time.increase(15 * 24 * 60 * 60);
    await world.write.syncLifecycle([1n], { account: keeper.account });
    await world.write.lifeTick([1n], { account: keeper.account });

    const intent = await world.read.lastLifeIntent([1n]);
    assert.ok(intent === 0 || intent === 5, `hibernating intent was ${intent}`); // REST or HIDE
  });
});
