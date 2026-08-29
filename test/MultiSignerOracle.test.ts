import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { keccak256, stringToBytes, type Address, type Hex } from "viem";

const { viem, networkHelpers } = await network.create();

const activityTypes = {
  ActivityAttestation: [
    { name: "wallet", type: "address" }, { name: "tokenId", type: "uint256" },
    { name: "chainId", type: "uint256" }, { name: "fromBlock", type: "uint64" },
    { name: "toBlock", type: "uint64" }, { name: "epochId", type: "bytes32" },
    { name: "activityDigest", type: "bytes32" }, { name: "xpDelta", type: "uint64" },
    { name: "personalityDeltas", type: "int16[8]" }, { name: "needDeltas", type: "int16[5]" },
    { name: "categoryCounters", type: "uint16[10]" }, { name: "nonce", type: "uint256" },
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
  const [admin, signerA, signerB, alice, keeper] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const chainId = BigInt(await publicClient.getChainId());
  const identity = await viem.deployContract("Merzavets", [admin.account.address]);
  const world = await viem.deployContract("MerzavetsWorld", [identity.address, admin.account.address]);
  await identity.write.setWorld([world.address], { account: admin.account });
  const oracle = await viem.deployContract("ActivityOracle", [world.address, identity.address, admin.account.address, signerA.account.address]);
  await world.write.setOracle([oracle.address], { account: admin.account });
  await identity.write.birth({ account: alice.account });
  const role = await oracle.read.ORACLE_SIGNER_ROLE();
  await oracle.write.grantRole([role, signerB.account.address], { account: admin.account });
  return { signerA, signerB, alice, keeper, chainId, oracle };
}

function activity(wallet: Address, chainId: bigint, sequence: number): Activity {
  const fromBlock = BigInt(sequence * 10 + 1);
  return {
    wallet,
    tokenId: 1n,
    chainId,
    fromBlock,
    toBlock: fromBlock + 9n,
    epochId: keccak256(stringToBytes(`multi-signer-epoch-${sequence}`)),
    activityDigest: keccak256(stringToBytes(`multi-signer-activity-${sequence}`)),
    xpDelta: 10n,
    personalityDeltas: [0, 0, 0, 0, 0, 0, 0, 0],
    needDeltas: [0, 0, 0, 0, 0],
    categoryCounters: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    nonce: BigInt(sequence),
    deadline: 4_000_000_000n,
  };
}

describe("multi-signer oracle observation", () => {
  it("accepts independently authorized signer-role members without requiring a quorum", async () => {
    const { signerA, signerB, alice, keeper, chainId, oracle } = await networkHelpers.loadFixture(fixture);
    const domain = { name: "Merzavtsy Activity Oracle", version: "1", chainId: Number(chainId), verifyingContract: oracle.address } as const;

    const first = activity(alice.account.address, chainId, 0);
    const firstSignature = await signerA.signTypedData({ account: signerA.account, domain, types: activityTypes, primaryType: "ActivityAttestation", message: first });
    await oracle.write.submit([first, firstSignature], { account: keeper.account });

    const second = activity(alice.account.address, chainId, 1);
    const secondSignature = await signerB.signTypedData({ account: signerB.account, domain, types: activityTypes, primaryType: "ActivityAttestation", message: second });
    await oracle.write.submit([second, secondSignature], { account: keeper.account });

    assert.equal(await oracle.read.nonces([alice.account.address]), 2n);
    assert.equal(await oracle.read.processedDigest([first.activityDigest]), true);
    assert.equal(await oracle.read.processedDigest([second.activityDigest]), true);
  });
});
