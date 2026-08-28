import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { keccak256, stringToBytes, type Address, type Hex } from "viem";

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
    { name: "mutationCounters", type: "uint16[4]" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

type Activity = {
  wallet: Address;
  tokenId: bigint;
  chainId: bigint;
  fromBlock: bigint;
  toBlock: bigint;
  epochId: Hex;
  activityDigest: Hex;
  xpDelta: bigint;
  personalityDeltas: readonly [number, number, number, number, number, number, number, number];
  needDeltas: readonly [number, number, number, number, number];
  categoryCounters: readonly [number, number, number, number, number, number, number, number, number, number];
  mutationCounters: readonly [number, number, number, number];
  nonce: bigint;
  deadline: bigint;
};

async function fixture() {
  const [admin, signer, alice, keeper] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const chainId = BigInt(await publicClient.getChainId());
  const identity = await viem.deployContract("Merzavets", [admin.account.address]);
  const world = await viem.deployContract("MerzavetsWorld", [identity.address, admin.account.address]);
  await identity.write.setWorld([world.address], { account: admin.account });
  const oracle = await viem.deployContract("ActivityOracle", [world.address, identity.address, admin.account.address, signer.account.address]);
  await world.write.setOracle([oracle.address], { account: admin.account });
  await identity.write.birth({ account: alice.account });

  const domain = { name: "Merzavtsy Activity Oracle", version: "1", chainId: Number(chainId), verifyingContract: oracle.address } as const;
  function activity(sequence: number, overrides: Partial<Activity> = {}): Activity {
    const fromBlock = BigInt(sequence * 10 + 1);
    return {
      wallet: alice.account.address,
      tokenId: 1n,
      chainId,
      fromBlock,
      toBlock: fromBlock + 9n,
      epochId: keccak256(stringToBytes(`expanded-epoch-${sequence}`)),
      activityDigest: keccak256(stringToBytes(`expanded-activity-${sequence}`)),
      xpDelta: 0n,
      personalityDeltas: [0,0,0,0,0,0,0,0],
      needDeltas: [0,0,0,0,0],
      categoryCounters: [0,0,0,0,0,0,0,0,0,0],
      mutationCounters: [0,0,0,0],
      nonce: BigInt(sequence),
      deadline: 4_000_000_000n,
      ...overrides,
    };
  }
  async function submit(value: Activity) {
    const signature = await signer.signTypedData({ account: signer.account, domain, types: activityTypes, primaryType: "ActivityAttestation", message: value });
    await oracle.write.submit([value, signature], { account: keeper.account });
  }
  return { admin, signer, alice, keeper, identity, world, oracle, activity, submit };
}

describe("expanded approved design", () => {
  it("initializes and bounds arousal + stabilityState and uses them in autonomous life", async () => {
    const { keeper, world } = await networkHelpers.loadFixture(fixture);
    const initial = await world.read.stateOf([1n]);
    assert.ok(initial.arousal >= 0 && initial.arousal <= 10_000);
    assert.ok(initial.stabilityState >= 0 && initial.stabilityState <= 10_000);
    await networkHelpers.time.increase(6 * 60 * 60 + 1);
    await world.write.lifeTick([1n], { account: keeper.account });
    const next = await world.read.stateOf([1n]);
    assert.ok(next.arousal >= 0 && next.arousal <= 10_000);
    assert.ok(next.stabilityState >= 0 && next.stabilityState <= 10_000);
  });

  it("awards bounded non-financial XP for awakening, mutation milestones and autonomous life", async () => {
    const { keeper, world, activity, submit } = await networkHelpers.loadFixture(fixture);
    await networkHelpers.time.increase(15 * 24 * 60 * 60);
    await world.write.syncLifecycle([1n], { account: keeper.account });
    const beforeWake = (await world.read.stateOf([1n])).xp;
    await submit(activity(0, { categoryCounters: [1,0,20,0,0,0,0,0,5,10] }));
    const afterWake = (await world.read.stateOf([1n])).xp;
    assert.ok(afterWake > beforeWake, "awakening/mutation milestones should add XP");
    await networkHelpers.time.increase(6 * 60 * 60 + 1);
    await world.write.lifeTick([1n], { account: keeper.account });
    assert.ok((await world.read.stateOf([1n])).xp > afterWake, "life should add a tiny biography XP bonus");
  });

  it("projects memory capacity and visible trait slots monotonically by level", async () => {
    const { world } = await networkHelpers.loadFixture(fixture);
    let priorMemory = 0n;
    let priorTraits = 0n;
    for (const level of [1n,2n,3n,5n,10n,25n,50n]) {
      const memory = await world.read.memoryCapacity([level]);
      const traits = await world.read.visibleTraitSlots([level]);
      assert.ok(memory >= priorMemory);
      assert.ok(traits >= priorTraits);
      priorMemory = memory;
      priorTraits = traits;
    }
  });

  it("gates advanced autonomous intents by level", async () => {
    const { world } = await networkHelpers.loadFixture(fixture);
    assert.equal(await world.read.intentUnlocked([1n, 2]), false); // SEEK_COMPANY
    assert.equal(await world.read.intentUnlocked([1n, 3]), false); // MOCK_RIVAL
    assert.equal(await world.read.intentUnlocked([2n, 2]), true);
    assert.equal(await world.read.intentUnlocked([3n, 3]), true);
  });

  it("uses explicit mutation counters plus age/level/dependency gates for advanced mutations", async () => {
    const { keeper, world, activity, submit } = await networkHelpers.loadFixture(fixture);
    await submit(activity(0, { xpDelta: 10_000n, categoryCounters: [0,0,30,0,30,0,0,0,0,0], mutationCounters: [10,10,0,10] }));
    let mask = await world.read.mutationMask([1n]);
    const rusty = await world.read.MUTATION_RUSTY_PAW();
    const networkScar = await world.read.MUTATION_NETWORK_SCAR();
    assert.equal(mask & rusty, 0n, "age gate must block Rusty Paw at birth");
    assert.equal(mask & networkScar, 0n, "dependency/age gate must block Network Scar at birth");

    await networkHelpers.time.increase(8 * 24 * 60 * 60);
    await world.write.syncLifecycle([1n], { account: keeper.account });
    mask = await world.read.mutationMask([1n]);
    assert.notEqual(mask & rusty, 0n);
    assert.notEqual(mask & networkScar, 0n);
    const storedMutationCounters = await world.read.mutationCounters([1n]);
    assert.equal(storedMutationCounters[1], 10);
  });
});
