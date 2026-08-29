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

async function deployOracleFixture() {
  const [admin, oracleSigner, alice, bob, outsider] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const chainId = BigInt(await publicClient.getChainId());

  const merzavets = await viem.deployContract("Merzavets", [admin.account.address]);
  const world = await viem.deployContract("MerzavetsWorld", [
    merzavets.address,
    admin.account.address,
  ]);
  await merzavets.write.setWorld([world.address], { account: admin.account });

  const oracle = await viem.deployContract("ActivityOracle", [
    world.address,
    merzavets.address,
    admin.account.address,
    oracleSigner.account.address,
  ]);
  await world.write.setOracle([oracle.address], { account: admin.account });
  await merzavets.write.birth({ account: alice.account });

  const domain = {
    name: "Merzavtsy Activity Oracle",
    version: "1",
    chainId: Number(chainId),
    verifyingContract: oracle.address,
  } as const;

  function makeActivity(overrides: Partial<Activity> = {}): Activity {
    return {
      wallet: alice.account.address,
      tokenId: 1n,
      chainId,
      fromBlock: 1n,
      toBlock: 10n,
      epochId: keccak256(stringToBytes("epoch-1")),
      activityDigest: keccak256(stringToBytes("activity-1")),
      xpDelta: 100n,
      personalityDeltas: [10, 20, 0, 0, 0, 0, 0, 0],
      needDeltas: [5, 0, -5, 0, 0],
      categoryCounters: [1, 0, 2, 0, 0, 0, 1, 0, 0, 0],
      nonce: 0n,
      deadline: 4_000_000_000n,
      ...overrides,
    };
  }

  async function sign(activity: Activity, signer = oracleSigner): Promise<Hex> {
    return signer.signTypedData({
      account: signer.account,
      domain,
      types: activityTypes,
      primaryType: "ActivityAttestation",
      message: activity,
    });
  }

  return {
    admin,
    oracleSigner,
    alice,
    bob,
    outsider,
    chainId,
    merzavets,
    world,
    oracle,
    makeActivity,
    sign,
  };
}

describe("ActivityOracle", function () {
  it("accepts an authorized bounded attestation exactly once and forwards it", async function () {
    const { alice, world, oracle, makeActivity, sign } = await networkHelpers.loadFixture(deployOracleFixture);
    const activity = makeActivity();
    const signature = await sign(activity);

    await oracle.write.submit([activity, signature], { account: alice.account });

    assert.equal(await oracle.read.processedDigest([activity.activityDigest]), true);
    assert.equal(await oracle.read.processedEpoch([1n, activity.epochId]), true);
    assert.equal(await oracle.read.nonces([alice.account.address]), 1n);
    assert.equal((await world.read.stateOf([1n])).xp, 100n);
  });

  it("rejects signatures from accounts without the oracle signer role", async function () {
    const { outsider, oracle, makeActivity, sign } = await networkHelpers.loadFixture(deployOracleFixture);
    const activity = makeActivity();
    const signature = await sign(activity, outsider);

    await viem.assertions.revertWithCustomError(
      oracle.write.submit([activity, signature], { account: outsider.account }),
      oracle,
      "UnauthorizedSigner",
    );
  });

  it("rejects expired, wrong-chain, wrong-owner, and over-cap attestations", async function () {
    const { alice, bob, chainId, oracle, makeActivity, sign } = await networkHelpers.loadFixture(deployOracleFixture);

    const expired = makeActivity({ deadline: 1n });
    await viem.assertions.revertWithCustomError(
      oracle.write.submit([expired, await sign(expired)], { account: alice.account }),
      oracle,
      "AttestationExpired",
    );

    const wrongChain = makeActivity({ chainId: chainId + 1n });
    await viem.assertions.revertWithCustomError(
      oracle.write.submit([wrongChain, await sign(wrongChain)], { account: alice.account }),
      oracle,
      "WrongChain",
    );

    const wrongOwner = makeActivity({ wallet: bob.account.address });
    await viem.assertions.revertWithCustomError(
      oracle.write.submit([wrongOwner, await sign(wrongOwner)], { account: alice.account }),
      oracle,
      "WalletTokenMismatch",
    );

    const overCap = makeActivity({ xpDelta: 10_001n });
    await viem.assertions.revertWithCustomError(
      oracle.write.submit([overCap, await sign(overCap)], { account: alice.account }),
      oracle,
      "ActivityOutOfBounds",
    );
  });

  it("rejects digest, epoch, and nonce replays", async function () {
    const { alice, oracle, makeActivity, sign } = await networkHelpers.loadFixture(deployOracleFixture);
    const first = makeActivity();
    await oracle.write.submit([first, await sign(first)], { account: alice.account });

    await viem.assertions.revertWithCustomError(
      oracle.write.submit([first, await sign(first)], { account: alice.account }),
      oracle,
      "DigestAlreadyProcessed",
    );

    const reusedEpoch = makeActivity({
      activityDigest: keccak256(stringToBytes("activity-2")),
      nonce: 1n,
      fromBlock: 11n,
      toBlock: 20n,
    });
    await viem.assertions.revertWithCustomError(
      oracle.write.submit([reusedEpoch, await sign(reusedEpoch)], { account: alice.account }),
      oracle,
      "EpochAlreadyProcessed",
    );

    const wrongNonce = makeActivity({
      epochId: keccak256(stringToBytes("epoch-2")),
      activityDigest: keccak256(stringToBytes("activity-3")),
      nonce: 9n,
      fromBlock: 11n,
      toBlock: 20n,
    });
    await viem.assertions.revertWithCustomError(
      oracle.write.submit([wrongNonce, await sign(wrongNonce)], { account: alice.account }),
      oracle,
      "InvalidNonce",
    );
  });
});
