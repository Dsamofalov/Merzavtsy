import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { keccak256, stringToBytes } from "viem";

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
  return { oracleSigner, alice, keeper, chainId, oracle, domain, publicClient };
}

async function signedActivity(
  setup: Awaited<ReturnType<typeof fixture>>,
  values: { fromBlock: bigint; toBlock: bigint; epoch: string; digest: string; nonce: bigint },
) {
  const activity = {
    wallet: setup.alice.account.address,
    tokenId: 1n,
    chainId: setup.chainId,
    fromBlock: values.fromBlock,
    toBlock: values.toBlock,
    epochId: keccak256(stringToBytes(values.epoch)),
    activityDigest: keccak256(stringToBytes(values.digest)),
    xpDelta: 1n,
    personalityDeltas: [0, 0, 0, 0, 0, 0, 0, 0] as const,
    needDeltas: [0, 0, 0, 0, 0] as const,
    categoryCounters: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] as const,
    nonce: values.nonce,
    deadline: 4_000_000_000n,
  };
  const signature = await setup.oracleSigner.signTypedData({
    account: setup.oracleSigner.account,
    domain: setup.domain,
    types: activityTypes,
    primaryType: "ActivityAttestation",
    message: activity,
  });
  return { activity, signature };
}

describe("oracle safety properties", () => {
  it("never consumes the same activity digest twice across generated nonce/range variations", async () => {
    const setup = await networkHelpers.loadFixture(fixture);
    let nextBlock = 1n;

    for (let i = 0; i < 20; i += 1) {
      const nonce = await setup.oracle.read.nonces([setup.alice.account.address]);
      const digest = `single-use-digest-${i}`;
      const first = await signedActivity(setup, {
        fromBlock: nextBlock,
        toBlock: nextBlock + 1n,
        epoch: `first-epoch-${i}`,
        digest,
        nonce,
      });
      await setup.oracle.write.submit([first.activity, first.signature], { account: setup.keeper.account });
      const nonceAfterSuccess = await setup.oracle.read.nonces([setup.alice.account.address]);
      assert.equal(nonceAfterSuccess, nonce + 1n);

      nextBlock += 10n;
      const replay = await signedActivity(setup, {
        fromBlock: nextBlock,
        toBlock: nextBlock + 1n,
        epoch: `different-epoch-${i}`,
        digest,
        nonce: nonceAfterSuccess,
      });
      await viem.assertions.revertWithCustomError(
        setup.oracle.write.submit([replay.activity, replay.signature], { account: setup.keeper.account }),
        setup.oracle,
        "DigestAlreadyProcessed",
      );
      assert.equal(
        await setup.oracle.read.nonces([setup.alice.account.address]),
        nonceAfterSuccess,
        "failed digest replay must not consume the next nonce",
      );
      nextBlock += 10n;
    }
  });

  it("cannot move user ETH or ERC-20 balances through any bounded activity payload even with token allowance", async () => {
    const setup = await networkHelpers.loadFixture(fixture);
    const token = await viem.deployContract("OracleAssetProbeToken", [setup.alice.account.address]);
    const minted = await token.read.balanceOf([setup.alice.account.address]);
    assert.ok(minted > 0n);

    await token.write.approve([setup.oracle.address, minted], { account: setup.alice.account });
    const aliceEthBefore = await setup.publicClient.getBalance({ address: setup.alice.account.address });
    const aliceTokenBefore = await token.read.balanceOf([setup.alice.account.address]);
    const oracleTokenBefore = await token.read.balanceOf([setup.oracle.address]);

    for (let i = 0; i < 12; i += 1) {
      const nonce = await setup.oracle.read.nonces([setup.alice.account.address]);
      const activity = await signedActivity(setup, {
        fromBlock: BigInt(i * 10 + 1),
        toBlock: BigInt(i * 10 + 9),
        epoch: `asset-safety-epoch-${i}`,
        digest: `asset-safety-digest-${i}`,
        nonce,
      });
      await setup.oracle.write.submit([activity.activity, activity.signature], { account: setup.keeper.account });
    }

    assert.equal(await setup.publicClient.getBalance({ address: setup.alice.account.address }), aliceEthBefore);
    assert.equal(await token.read.balanceOf([setup.alice.account.address]), aliceTokenBefore);
    assert.equal(await token.read.balanceOf([setup.oracle.address]), oracleTokenBefore);
    assert.equal(await token.read.allowance([setup.alice.account.address, setup.oracle.address]), minted);
  });
});
