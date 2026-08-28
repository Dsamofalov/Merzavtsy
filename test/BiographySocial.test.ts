import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

const { viem, networkHelpers } = await network.create();

async function fixture() {
  const [admin, alice, bob, carol, keeper] = await viem.getWalletClients();
  const identity = await viem.deployContract("Merzavets", [admin.account.address]);
  const world = await viem.deployContract("MerzavetsWorld", [identity.address, admin.account.address]);
  await identity.write.setWorld([world.address], { account: admin.account });
  await identity.write.birth({ account: alice.account });
  await identity.write.birth({ account: bob.account });
  await identity.write.birth({ account: carol.account });
  return { admin, alice, bob, carol, keeper, identity, world };
}

async function actMany(
  world: Awaited<ReturnType<typeof viem.deployContract>>,
  account: { address: `0x${string}` },
  actor: bigint,
  target: bigint,
  action: number,
  count: number,
) {
  for (let i = 0; i < count; i += 1) {
    if (i > 0) await networkHelpers.time.increase(6 * 60 * 60 + 1);
    await world.write.socialize([actor, target, action], { account });
  }
}

describe("irreversible social biography", () => {
  it("emits friendship once, then betrayal once when trusted friendship is attacked", async () => {
    const { alice, world } = await networkHelpers.loadFixture(fixture);
    await actMany(world, alice.account, 1n, 2n, 2, 4); // HELP to friendship
    const friendBit = await world.read.RELATIONSHIP_FRIEND();
    const betrayedBit = await world.read.RELATIONSHIP_BETRAYED();
    let milestones = await world.read.relationshipMilestoneMask([1n, 2n]);
    assert.notEqual(milestones & friendBit, 0n);
    assert.equal(milestones & betrayedBit, 0n);

    await networkHelpers.time.increase(6 * 60 * 60 + 1);
    await world.write.socialize([1n, 2n, 3], { account: alice.account }); // THREATEN
    milestones = await world.read.relationshipMilestoneMask([1n, 2n]);
    assert.notEqual(milestones & betrayedBit, 0n);
    const hostile = await world.read.hostileSocialCount([1n]);
    assert.equal(hostile, 1);

    await networkHelpers.time.increase(6 * 60 * 60 + 1);
    await world.write.socialize([1n, 2n, 3], { account: alice.account });
    assert.equal(await world.read.relationshipMilestoneMask([1n, 2n]), milestones, "milestone bits are one-time");
  });

  it("creates rivalry milestone + irreversible scar and unlocks Double Tongue from hostile history", async () => {
    const { alice, world } = await networkHelpers.loadFixture(fixture);
    await actMany(world, alice.account, 1n, 2n, 1, 6); // MOCK
    const rivalBit = await world.read.RELATIONSHIP_RIVAL();
    assert.notEqual((await world.read.relationshipMilestoneMask([1n, 2n])) & rivalBit, 0n);
    const rivalryScar = await world.read.SCAR_FIRST_RIVALRY();
    assert.notEqual((await world.read.scarMask([1n])) & rivalryScar, 0n);
    const doubleTongue = await world.read.MUTATION_DOUBLE_TONGUE();
    assert.notEqual((await world.read.mutationMask([1n])) & doubleTongue, 0n);
  });

  it("adds old-account and rare-combination scars exactly once", async () => {
    const { keeper, world } = await networkHelpers.loadFixture(fixture);
    await networkHelpers.time.increase(91 * 24 * 60 * 60);
    await world.write.syncLifecycle([1n], { account: keeper.account });
    const oldScar = await world.read.SCAR_OLD_ACCOUNT();
    assert.notEqual((await world.read.scarMask([1n])) & oldScar, 0n);
    assert.equal(await world.read.scarUnlockCount([1n, oldScar]), 1);
  });

  it("uses target personality, recent relationship state and deterministic seed in previewed outcomes", async () => {
    const { alice, world } = await networkHelpers.loadFixture(fixture);
    const a = await world.read.previewSocialOutcome([1n, 2n, 0]);
    const repeat = await world.read.previewSocialOutcome([1n, 2n, 0]);
    const differentTarget = await world.read.previewSocialOutcome([1n, 3n, 0]);
    assert.deepEqual(a, repeat, "same canonical state produces the same preview");
    assert.notDeepEqual(a, differentTarget, "target personality/id changes the deterministic outcome");

    await world.write.socialize([1n, 2n, 0], { account: alice.account });
    await networkHelpers.time.increase(6 * 60 * 60 + 1);
    const afterHistory = await world.read.previewSocialOutcome([1n, 2n, 0]);
    assert.notDeepEqual(a, afterHistory, "recent relationship history changes later outcome");
  });
});
