import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DaemonStore } from "../src/store.js";
import { submitPendingPeerEncounters, type SignedPeer } from "../src/peer-submitter.js";
import type { PeerAttestation, PeerObservation } from "../src/peer-attestation.js";

const actor = "0x1111111111111111111111111111111111111111";
const peer = "0x2222222222222222222222222222222222222222";
const digest = `0x${"ab".repeat(32)}` as const;
const txHash = `0x${"cd".repeat(32)}` as const;

function observation(): PeerObservation {
  return {
    actorWallet: actor,
    actorTokenId: 1n,
    peerWallet: peer,
    peerTokenId: 2n,
    chainId: 31337n,
    blockNumber: 100n,
    encounterDigest: digest,
  };
}

function signed(nonce = 0n): SignedPeer {
  const attestation: PeerAttestation = {
    ...observation(),
    nonce,
    deadline: 1_900_000_000n,
  };
  return { attestation, signature: `0x${"55".repeat(65)}` as const };
}

describe("peer attestation submitter", () => {
  it("persists broadcast before receipt and completes a peer encounter", async () => {
    const store = new DaemonStore(":memory:");
    store.putPeerEncounter(observation());
    try {
      const result = await submitPendingPeerEncounters({
        store,
        sign: async (_observation, nonce) => signed(nonce),
        getNonce: async () => 3n,
        isEncounterConsumed: async () => false,
        broadcast: async (value) => {
          assert.equal(value.attestation.nonce, 3n);
          return txHash;
        },
        waitForReceipt: async (hash) => {
          assert.equal(hash, txHash);
          assert.equal(store.pendingPeerEncounters()[0]?.broadcastTxHash, txHash);
          return "success";
        },
      });

      assert.equal(result[0]?.status, "submitted");
      assert.deepEqual(store.pendingPeerEncounters(), []);
    } finally {
      store.close();
    }
  });

  it("recovers an existing broadcast without signing or rebroadcasting", async () => {
    const store = new DaemonStore(":memory:");
    store.putPeerEncounter(observation());
    store.markPeerBroadcast(digest, txHash);
    let calls = 0;
    try {
      const result = await submitPendingPeerEncounters({
        store,
        sign: async () => { calls += 1; return signed(); },
        getNonce: async () => { calls += 1; return 0n; },
        isEncounterConsumed: async () => false,
        broadcast: async () => { calls += 1; return txHash; },
        waitForReceipt: async () => "success",
      });

      assert.equal(calls, 0);
      assert.equal(result[0]?.status, "submitted");
    } finally {
      store.close();
    }
  });

  it("marks an already-consumed encounter complete without signing", async () => {
    const store = new DaemonStore(":memory:");
    store.putPeerEncounter(observation());
    let signedCount = 0;
    try {
      const result = await submitPendingPeerEncounters({
        store,
        sign: async () => { signedCount += 1; return signed(); },
        getNonce: async () => 0n,
        isEncounterConsumed: async () => true,
        broadcast: async () => txHash,
        waitForReceipt: async () => "success",
      });

      assert.equal(signedCount, 0);
      assert.equal(result[0]?.status, "already-consumed");
      assert.deepEqual(store.pendingPeerEncounters(), []);
    } finally {
      store.close();
    }
  });
});
