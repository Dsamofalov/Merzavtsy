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
  nonce: bigint;
  deadline: bigint;
};

async function fixture() {
  const [admin, signer, alice, keeper] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const chainId = BigInt(await publicClient.getChainId());
  const merzavets = await viem.deployContract("Merzavets", [admin.account.address]);
  const world = await viem.deployContract("MerzavetsWorld", [merzavets.address, admin.account.address]);
  await merzavets.write.setWorld([world.address], { account: admin.account });
  const oracle = await viem.deployContract("ActivityOracle", [
    world.address,
    merzavets.address,
    admin.account.address,
    signer.account.address,
  ]);
  await world.write.setOracle([oracle.address], { account: admin.account });
  await merzavets.write.birth({ account: alice.account });

  const domain = {
    name: "Merzavtsy Activity Oracle",
    version: "1",
    chainId: Number(chainId),
    verifyingContract: oracle.address,
  } as const;

  function activity(sequence: number, overrides: Partial<Activity> = {}): Activity {
    const fromBlock = BigInt(sequence * 10 + 1);
    return {
      wallet: alice.account.address,
      tokenId: 1n,
      chainId,
      fromBlock,
      toBlock: fromBlock + 9n,
      epochId: keccak256(stringToBytes(`evolution-epoch-${sequence}`)),
      activityDigest: keccak256(stringToBytes(`evolution-activity-${sequence}`)),
      xpDelta: 0n,
      personalityDeltas: [0, 0, 0, 0, 0, 0, 0, 0],
      needDeltas: [0, 0, 0, 0, 0],
      categoryCounters: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      nonce: BigInt(sequence),
      deadline: 4_000_000_000n,
      ...overrides,
    };
  }

  async function submit(value: Activity) {
    const signature = await signer.signTypedData({
      account: signer.account,
      domain,
      types: activityTypes,
      primaryType: "ActivityAttestation",
      message: value,
    });
    await oracle.write.submit([value, signature], { account: keeper.account });
  }

  return { admin, signer, alice, keeper, merzavets, world, oracle, activity, submit };
}

describe("Merzavets evolution", function () {
  it("hibernates after 14 days and marks very long sleep as irreversible biography", async function () {
    const { keeper, world } = await networkHelpers.loadFixture(fixture);

    await networkHelpers.time.increase(31 * 24 * 60 * 60);
    await world.write.syncLifecycle([1n], { account: keeper.account });

    const state = await world.read.stateOf([1n]);
    const mutationMask = await world.read.mutationMask([1n]);
    const scarMask = await world.read.scarMask([1n]);

    assert.equal(state.hibernating, true);
    assert.notEqual(mutationMask & (await world.read.MUTATION_WALLET_MOLD()), 0n);
    assert.notEqual(scarMask & (await world.read.SCAR_LONG_SLEEP()), 0n);
  });

  it("awakens atomically when verified wallet activity arrives", async function () {
    const { keeper, world, activity, submit } = await networkHelpers.loadFixture(fixture);

    await networkHelpers.time.increase(15 * 24 * 60 * 60);
    await world.write.syncLifecycle([1n], { account: keeper.account });
    assert.equal((await world.read.stateOf([1n])).hibernating, true);

    await submit(activity(0, { xpDelta: 25n, categoryCounters: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] }));

    assert.equal((await world.read.stateOf([1n])).hibernating, false);
    assert.equal(await world.read.awakeningCount([1n]), 1);
  });

  it("unlocks deterministic mutations and scars from cumulative activity", async function () {
    const { world, activity, submit } = await networkHelpers.loadFixture(fixture);

    await submit(activity(0, {
      categoryCounters: [0, 0, 20, 0, 0, 1, 0, 0, 5, 10],
    }));

    const mutations = await world.read.mutationMask([1n]);
    const scars = await world.read.scarMask([1n]);

    assert.notEqual(mutations & (await world.read.MUTATION_CONTRACT_TEETH()), 0n);
    assert.notEqual(mutations & (await world.read.MUTATION_GAS_GILLS()), 0n);
    assert.notEqual(mutations & (await world.read.MUTATION_CALLDATA_EYE()), 0n);
    assert.notEqual(scars & (await world.read.SCAR_FIRST_DEPLOYMENT()), 0n);
    assert.notEqual(scars & (await world.read.SCAR_FIRST_MUTATION()), 0n);
  });

  it("requires both biography and chronological age to advance lifecycle stage", async function () {
    const { keeper, world, activity, submit } = await networkHelpers.loadFixture(fixture);

    await submit(activity(0, {
      xpDelta: 500n,
      categoryCounters: [1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    }));
    await world.write.syncLifecycle([1n], { account: keeper.account });
    assert.equal((await world.read.stateOf([1n])).stage, 0);

    await networkHelpers.time.increase(24 * 60 * 60 + 1);
    await world.write.syncLifecycle([1n], { account: keeper.account });
    assert.equal((await world.read.stateOf([1n])).stage, 1);
  });
});
