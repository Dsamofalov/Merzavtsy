import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { keccak256, stringToBytes } from "viem";

const { viem, networkHelpers } = await network.create();

async function fixture() {
  const [admin, alice, bob, carol, keeper] = await viem.getWalletClients();
  const identity = await viem.deployContract("Merzavets", [admin.account.address]);
  const world = await viem.deployContract("MerzavetsWorld", [identity.address, admin.account.address]);
  await identity.write.setWorld([world.address], { account: admin.account });
  await world.write.setOracle([admin.account.address], { account: admin.account });
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

function activity(tokenId: bigint, sequence: number, personalityDeltas: readonly [number, number, number, number, number, number, number, number]) {
  return {
    wallet: "0x0000000000000000000000000000000000000001" as const,
    tokenId,
    chainId: 31337n,
    fromBlock: BigInt(sequence + 1),
    toBlock: BigInt(sequence + 1),
    epochId: keccak256(stringToBytes(`final-epoch-${sequence}`)),
    activityDigest: keccak256(stringToBytes(`final-activity-${sequence}`)),
    xpDelta: 0n,
    personalityDeltas,
    needDeltas: [0, 0, 0, 0, 0] as const,
    categoryCounters: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as const,
    nonce: BigInt(sequence),
    deadline: 4_000_000_000n,
  };
}

describe("final autonomous-memory design batch", () => {
  it("uses relationship graph, recent significant events and every numeric personality axis in the life context", async () => {
    const { admin, alice, world } = await networkHelpers.loadFixture(fixture);
    const initial = await world.read.lifeContextDigest([1n]);
    const recentBefore = await world.read.recentSignificantEventCount([1n]);

    await world.write.socialize([1n, 2n, 2], { account: alice.account });
    const afterFirstPeer = await world.read.lifeContextDigest([1n]);
    assert.notEqual(afterFirstPeer, initial);
    assert.ok((await world.read.recentSignificantEventCount([1n])) > recentBefore);

    await world.write.socialize([1n, 3n, 0], { account: alice.account });
    assert.notEqual(await world.read.secondaryPeer([1n]), 0n, "life graph must retain more than one peer");
    const afterGraphExpansion = await world.read.lifeContextDigest([1n]);
    assert.notEqual(afterGraphExpansion, afterFirstPeer);

    const omittedAxes: Array<readonly [number, number, number, number, number, number, number, number]> = [
      [0, 0, 0, 100, 0, 0, 0, 0],
      [0, 0, 0, 0, 100, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 100, 0],
      [0, 0, 0, 0, 0, 0, 0, 100],
    ];
    let prior = afterGraphExpansion;
    for (let i = 0; i < omittedAxes.length; i += 1) {
      await world.write.applyVerifiedActivity([activity(1n, i, omittedAxes[i]!)], { account: admin.account });
      const next = await world.read.lifeContextDigest([1n]);
      assert.notEqual(next, prior, `personality axis ${i} must directly affect life context`);
      prior = next;
    }
  });

  it("applies memoryBias-dependent relationship retention during autonomous life", async () => {
    const { alice, keeper, world } = await networkHelpers.loadFixture(fixture);
    await actMany(world, alice.account, 1n, 2n, 2, 4);
    const before = await world.read.relationshipOf([1n, 2n]);
    const retention = await world.read.relationshipRetentionBps([1n, 6n * 60n * 60n]);
    assert.ok(retention >= 5_000n && retention <= 10_000n);

    await networkHelpers.time.increase(6 * 60 * 60 + 1);
    await world.write.lifeTick([1n], { account: keeper.account });
    const after = await world.read.relationshipOf([1n, 2n]);
    assert.ok(Math.abs(Number(after.affinity)) <= Math.abs(Number(before.affinity)));
    assert.ok(Math.abs(Number(after.trust)) <= Math.abs(Number(before.trust)));
  });

  it("implements the prose need tendencies for positive contact and conflict", async () => {
    const { alice, world } = await networkHelpers.loadFixture(fixture);
    const initial = await world.read.stateOf([1n]);
    await world.write.socialize([1n, 2n, 2], { account: alice.account }); // HELP
    const positive = await world.read.stateOf([1n]);
    assert.ok(positive.mood > initial.mood, "positive encounter raises mood");
    assert.ok(positive.socialNeed < initial.socialNeed, "contact reduces social need");
    assert.ok(positive.stress <= initial.stress, "positive encounter does not raise stress");

    await networkHelpers.time.increase(6 * 60 * 60 + 1);
    await world.write.socialize([1n, 2n, 3], { account: alice.account }); // THREATEN
    const conflict = await world.read.stateOf([1n]);
    assert.ok(conflict.stress > positive.stress, "conflict raises stress");
    assert.ok(conflict.mood < positive.mood, "conflict lowers mood");
  });

  it("unlocks Double Tongue from two close peers that are mutually hostile", async () => {
    const { alice, bob, world } = await networkHelpers.loadFixture(fixture);
    await actMany(world, alice.account, 1n, 2n, 2, 4); // friend Bob
    await networkHelpers.time.increase(6 * 60 * 60 + 1);
    await actMany(world, alice.account, 1n, 3n, 2, 4); // friend Carol
    await networkHelpers.time.increase(6 * 60 * 60 + 1);
    await actMany(world, bob.account, 2n, 3n, 1, 6); // Bob rivals Carol
    await networkHelpers.time.increase(6 * 60 * 60 + 1);
    await world.write.socialize([1n, 2n, 0], { account: alice.account }); // re-evaluate Alice graph

    const doubleTongue = await world.read.MUTATION_DOUBLE_TONGUE();
    assert.notEqual((await world.read.mutationMask([1n])) & doubleTongue, 0n);
  });
});
