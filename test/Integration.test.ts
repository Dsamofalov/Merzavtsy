import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import type { Hex } from "viem";
import { aggregateEpoch } from "../daemon/src/aggregator.js";
import { ActivityCategory, classifyTransaction } from "../daemon/src/classifier.js";
import {
  ACTIVITY_TYPES,
  activityDomain,
  buildAttestation,
} from "../daemon/src/attestation.js";
import { PEER_TYPES, buildPeerAttestation } from "../daemon/src/peer-attestation.js";
import type { ObservedTransaction } from "../daemon/src/types.js";

const { viem, networkHelpers } = await network.create();

async function integrationFixture() {
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

  return { admin, oracleSigner, alice, bob, keeper, chainId, merzavets, world, oracle };
}

describe("local watcher-to-world integration", () => {
  it("classifies, aggregates, signs and applies wallet + peer activity before autonomous life", async () => {
    const { oracleSigner, alice, bob, keeper, chainId, world, oracle } =
      await networkHelpers.loadFixture(integrationFixture);

    const raw: ObservedTransaction = {
      chainId,
      blockNumber: 100n,
      blockHash: `0x${"10".repeat(32)}` as Hex,
      txHash: `0x${"20".repeat(32)}` as Hex,
      from: alice.account.address,
      to: bob.account.address,
      value: 1_000_000_000_000_000n,
      gasUsed: 21_000n,
      input: "0x",
      createdContract: null,
    };

    const classified = classifyTransaction(raw, {
      wallet: alice.account.address,
      tokenId: 1n,
      registeredPeers: new Map([[bob.account.address.toLowerCase(), 2n]]),
      knownContracts: new Set(),
      seenContracts: new Set(),
      seenCounterparties: new Set(),
      seenSelectors: new Set(),
      highGasThreshold: 150_000n,
      destinationHasCode: false,
    });
    assert.ok(classified.some((item) => item.category === ActivityCategory.REGISTERED_PEER_CONTACT));

    const summary = aggregateEpoch(
      alice.account.address,
      1n,
      chainId,
      100n,
      100n,
      classified,
    );
    const activity = buildAttestation(summary, 0n, 4_000_000_000n);
    const activitySignature = await oracleSigner.signTypedData({
      account: oracleSigner.account,
      domain: activityDomain(chainId, oracle.address),
      types: ACTIVITY_TYPES,
      primaryType: "ActivityAttestation",
      message: activity,
    });
    await oracle.write.submit([activity, activitySignature], { account: keeper.account });

    const stateAfterActivity = await world.read.stateOf([1n]);
    const counters = await world.read.activityCounters([1n]);
    assert.ok(stateAfterActivity.xp > 0n);
    assert.equal(counters[ActivityCategory.REGISTERED_PEER_CONTACT], 1);

    const peer = buildPeerAttestation(
      {
        actorWallet: alice.account.address,
        actorTokenId: 1n,
        peerWallet: bob.account.address,
        peerTokenId: 2n,
        chainId,
        blockNumber: raw.blockNumber,
        encounterDigest: raw.txHash,
      },
      0n,
      4_000_000_000n,
    );
    const peerSignature = await oracleSigner.signTypedData({
      account: oracleSigner.account,
      domain: activityDomain(chainId, oracle.address),
      types: PEER_TYPES,
      primaryType: "PeerAttestation",
      message: peer,
    });
    await oracle.write.submitPeer([peer, peerSignature], { account: keeper.account });

    const relationship = await world.read.relationshipOf([1n, 2n]);
    assert.ok(relationship.affinity > 0n);
    assert.ok(relationship.trust > 0n);
    assert.equal(relationship.interactionCount, 1);

    await networkHelpers.time.increase(6 * 60 * 60 + 1);
    await world.write.lifeTick([1n], { account: keeper.account });
    assert.equal(await world.read.lifeActionCount([1n]), 1);
    const intent = await world.read.lastLifeIntent([1n]);
    assert.ok(intent >= 0 && intent <= 5);
  });
});
