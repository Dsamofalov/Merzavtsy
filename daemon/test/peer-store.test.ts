import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DaemonStore } from "../src/store.js";
import type { PeerObservation } from "../src/peer-attestation.js";

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

describe("peer encounter persistence", () => {
  it("stores one deterministic encounter and persists it across restart semantics", () => {
    const store = new DaemonStore(":memory:");
    assert.equal(store.putPeerEncounter(observation()), true);
    assert.equal(store.putPeerEncounter(observation()), false);

    const pending = store.pendingPeerEncounters();
    assert.equal(pending.length, 1);
    assert.deepEqual(pending[0]?.observation, observation());
    assert.equal(pending[0]?.broadcastTxHash, null);
    assert.equal(pending[0]?.completed, false);
    store.close();
  });

  it("never rewrites a broadcast or successful peer transaction hash", () => {
    const store = new DaemonStore(":memory:");
    store.putPeerEncounter(observation());
    assert.equal(store.markPeerBroadcast(digest, txHash), true);
    assert.equal(store.markPeerBroadcast(digest, txHash), false);
    assert.throws(
      () => store.markPeerBroadcast(digest, `0x${"ef".repeat(32)}`),
      /already broadcast/,
    );

    assert.equal(store.markPeerSubmitted(digest, txHash), true);
    assert.equal(store.pendingPeerEncounters().length, 0);
    assert.equal(store.markPeerSubmitted(digest, txHash), false);
    store.close();
  });
});
