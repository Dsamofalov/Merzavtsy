import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { keccak256, stringToBytes, type Address, type Hex } from "viem";

const { viem, networkHelpers } = await network.create();

const peerTypes = {
  PeerAttestation: [
    { name: "actorWallet", type: "address" },
    { name: "actorTokenId", type: "uint256" },
    { name: "peerWallet", type: "address" },
    { name: "peerTokenId", type: "uint256" },
    { name: "chainId", type: "uint256" },
    { name: "blockNumber", type: "uint64" },
    { name: "encounterDigest", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

type PeerActivity = {
  actorWallet: Address;
  actorTokenId: bigint;
  peerWallet: Address;
  peerTokenId: bigint;
  chainId: bigint;
  blockNumber: bigint;
  encounterDigest: Hex;
  nonce: bigint;
  deadline: bigint;
};

async function deployPeerFixture() {
  const [admin, oracleSigner, alice, bob, outsider] = await viem.getWalletClients();
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

  function makePeer(overrides: Partial<PeerActivity> = {}): PeerActivity {
    return {
      actorWallet: alice.account.address,
      actorTokenId: 1n,
      peerWallet: bob.account.address,
      peerTokenId: 2n,
      chainId,
      blockNumber: 100n,
      encounterDigest: keccak256(stringToBytes("alice-to-bob-100")),
      nonce: 0n,
      deadline: 4_000_000_000n,
      ...overrides,
    };
  }

  async function signPeer(peer: PeerActivity, signer = oracleSigner): Promise<Hex> {
    return signer.signTypedData({
      account: signer.account,
      domain,
      types: peerTypes,
      primaryType: "PeerAttestation",
      message: peer,
    });
  }

  return { admin, oracleSigner, alice, bob, outsider, chainId, merzavets, world, oracle, makePeer, signPeer };
}

describe("verified registered-peer activity", () => {
  it("cannot be forged by calling the world directly", async () => {
    const { outsider, world, makePeer } = await networkHelpers.loadFixture(deployPeerFixture);
    const peer = makePeer();
    await viem.assertions.revertWithCustomError(
      world.write.applyVerifiedPeerContact(
        [peer.actorTokenId, peer.peerTokenId, peer.encounterDigest],
        { account: outsider.account },
      ),
      world,
      "OnlyOracle",
    );
  });

  it("accepts a signed peer encounter once and changes only the directed A-to-B relationship", async () => {
    const { alice, world, oracle, makePeer, signPeer } = await networkHelpers.loadFixture(deployPeerFixture);
    const peer = makePeer();
    await oracle.write.submitPeer([peer, await signPeer(peer)], { account: alice.account });

    const forward = await world.read.relationshipOf([1n, 2n]);
    const reverse = await world.read.relationshipOf([2n, 1n]);
    assert.ok(forward.affinity > 0n);
    assert.ok(forward.trust > 0n);
    assert.equal(forward.interactionCount, 1);
    assert.equal(reverse.interactionCount, 0);
    assert.equal(await oracle.read.processedPeerEncounter([peer.encounterDigest]), true);
    assert.equal(await oracle.read.peerNonces([alice.account.address]), 1n);

    await viem.assertions.revertWithCustomError(
      oracle.write.submitPeer([peer, await signPeer(peer)], { account: alice.account }),
      oracle,
      "PeerEncounterAlreadyProcessed",
    );
  });

  it("binds both registered token owners and the peer nonce", async () => {
    const { alice, bob, oracle, makePeer, signPeer } = await networkHelpers.loadFixture(deployPeerFixture);

    const wrongPeerOwner = makePeer({ peerWallet: alice.account.address });
    await viem.assertions.revertWithCustomError(
      oracle.write.submitPeer([wrongPeerOwner, await signPeer(wrongPeerOwner)], { account: alice.account }),
      oracle,
      "PeerWalletTokenMismatch",
    );

    const wrongNonce = makePeer({
      encounterDigest: keccak256(stringToBytes("wrong-nonce")),
      nonce: 9n,
      peerWallet: bob.account.address,
    });
    await viem.assertions.revertWithCustomError(
      oracle.write.submitPeer([wrongNonce, await signPeer(wrongNonce)], { account: alice.account }),
      oracle,
      "InvalidPeerNonce",
    );
  });
});
