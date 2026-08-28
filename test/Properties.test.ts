import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { keccak256, stringToBytes, type Hex } from "viem";

const { viem, networkHelpers } = await network.create();

const activityTypes = {
  ActivityAttestation: [
    { name: "wallet", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "chainId", type: "uint256" },
    { name: "fromBlock", type: "uint64" },
    { name: "toBlock", type: "uint64" },
    { name: "epochId", type: "bytes32" },
    { name: "activityDigest", type: "bytes32" },
    { name: "xpDelta", type: "uint64" },
    { name: "personalityDeltas", type: "int16[8]" },
    { name: "needDeltas", type: "int16[5]" },
    { name: "categoryCounters", type: "uint16[10]" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

async function fixture() {
  const [admin, oracleSigner, alice, bob, keeper] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const chainId = BigInt(await publicClient.getChainId());
  const merzavets = await viem.deployContract("Merzavets", [admin.account.address]);
  const world = await viem.deployContract("MerzavetsWorld", [merzavets.address, admin.account.address]);
  await merzavets.write.setWorld([world.address], { account: admin.account });
  const oracle = await viem.deployContract("ActivityOracle", [
    world.address,
    merzavets.address,
    admin.account.address,
    oracleSigner.account.address,
  ]);
  await world.write.setOracle([oracle.address], { account: admin.account });
  await merzavets.write.birth({ account: alice.account });
  await merzavets.write.birth({ account: bob.account });
  const domain = {
    name: "Merzavtsy Activity Oracle",
    version: "1",
    chainId: Number(chainId),
    verifyingContract: oracle.address,
  } as const;
  return { oracleSigner, alice, bob, keeper, chainId, merzavets, world, oracle, domain };
}

function assertCreatureBounds(state: {
  aggression: number;
  curiosity: number;
  sociability: number;
  greed: number;
  stability: number;
  chaos: number;
  adaptability: number;
  memoryBias: number;
  energy: number;
  mood: number;
  boredom: number;
  stress: number;
  socialNeed: number;
}) {
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
    assert.ok(value >= 0 && value <= 10_000, `bounded stat escaped range: ${value}`);
  }
}

describe("Merzavtsy contract invariants", () => {
  it("keeps every bounded creature stat in range while XP only increases across an activity sequence", async () => {
    const { oracleSigner, alice, chainId, world, oracle, domain } = await networkHelpers.loadFixture(fixture);
    let previousXp = 0n;

    for (let i = 0; i < 24; i += 1) {
      const sign = i % 2 === 0 ? 1 : -1;
      const personalityDeltas = Array.from({ length: 8 }, (_, axis) => sign * (200 + ((i * 37 + axis * 53) % 700))) as [number, number, number, number, number, number, number, number];
      const needDeltas = Array.from({ length: 5 }, (_, axis) => -sign * (150 + ((i * 29 + axis * 41) % 600))) as [number, number, number, number, number];
      const categoryCounters = Array.from({ length: 10 }, (_, category) => ((i + category) % 4 === 0 ? 3 : 0)) as [number, number, number, number, number, number, number, number, number, number];
      const fromBlock = BigInt(i * 10 + 1);
      const activity = {
        wallet: alice.account.address,
        tokenId: 1n,
        chainId,
        fromBlock,
        toBlock: fromBlock + 9n,
        epochId: keccak256(stringToBytes(`property-epoch-${i}`)),
        activityDigest: keccak256(stringToBytes(`property-digest-${i}`)),
        xpDelta: BigInt(50 + i * 17),
        personalityDeltas,
        needDeltas,
        categoryCounters,
        nonce: BigInt(i),
        deadline: 4_000_000_000n,
      };
      const signature = await oracleSigner.signTypedData({
        account: oracleSigner.account,
        domain,
        types: activityTypes,
        primaryType: "ActivityAttestation",
        message: activity,
      });
      await oracle.write.submit([activity, signature], { account: alice.account });

      const state = await world.read.stateOf([1n]);
      assert.ok(state.xp >= previousXp, `XP decreased from ${previousXp} to ${state.xp}`);
      previousXp = state.xp;
      assertCreatureBounds(state);
    }
  });

  it("never lets repeated relationship updates escape their signed/unsigned bounds", async () => {
    const { alice, world } = await networkHelpers.loadFixture(fixture);

    for (let i = 0; i < 48; i += 1) {
      await world.write.socialize([1n, 2n, i % 4], { account: alice.account });
      const relationship = await world.read.relationshipOf([1n, 2n]);
      assert.ok(relationship.affinity >= -10_000 && relationship.affinity <= 10_000);
      assert.ok(relationship.trust >= -10_000 && relationship.trust <= 10_000);
      for (const value of [relationship.fear, relationship.respect, relationship.envy, relationship.rivalry]) {
        assert.ok(value >= 0 && value <= 10_000, `relationship escaped range: ${value}`);
      }
      if (i !== 47) await networkHelpers.time.increase(6 * 60 * 60 + 1);
    }
    assert.equal((await world.read.relationshipOf([1n, 2n])).interactionCount, 48);
  });

  it("preserves soulbound ownership through oracle activity, social actions and autonomous ticks", async () => {
    const { alice, bob, keeper, merzavets, world } = await networkHelpers.loadFixture(fixture);
    assert.equal(await merzavets.read.ownerOf([1n]), alice.account.address);

    await world.write.socialize([1n, 2n, 2], { account: alice.account });
    await networkHelpers.time.increase(6 * 60 * 60 + 1);
    await world.write.lifeTick([1n], { account: keeper.account });

    assert.equal(await merzavets.read.ownerOf([1n]), alice.account.address);
    assert.equal(await merzavets.read.ownerOf([2n]), bob.account.address);
    await viem.assertions.revertWithCustomError(
      merzavets.write.transferFrom([alice.account.address, bob.account.address, 1n], { account: alice.account }),
      merzavets,
      "Soulbound",
    );
  });

  it("repeated life ticks before cooldown cannot mutate state", async () => {
    const { keeper, world } = await networkHelpers.loadFixture(fixture);
    await networkHelpers.time.increase(6 * 60 * 60 + 1);
    await world.write.lifeTick([1n], { account: keeper.account });
    const before = await world.read.stateOf([1n]);
    const countBefore = await world.read.lifeActionCount([1n]);

    await viem.assertions.revertWithCustomError(
      world.write.lifeTick([1n], { account: keeper.account }),
      world,
      "LifeTickCooldown",
    );
    assert.deepEqual(await world.read.stateOf([1n]), before);
    assert.equal(await world.read.lifeActionCount([1n]), countBefore);
  });
});
