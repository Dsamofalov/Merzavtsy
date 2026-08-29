import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { DaemonStore } from "../src/store.js";
import {
  createRuntimeSubmitter,
  loadLifeCandidates,
  type RuntimeSubmissionGateway,
} from "../src/runtime-wiring.js";
import type { EpochSummary } from "../src/types.js";
import type { PeerObservation } from "../src/peer-attestation.js";

const wallet = "0x1111111111111111111111111111111111111111" as Address;
const peer = "0x2222222222222222222222222222222222222222" as Address;
const oracle = "0x3333333333333333333333333333333333333333" as Address;
const epochId = `0x${"11".repeat(32)}` as Hex;
const encounterDigest = `0x${"22".repeat(32)}` as Hex;
const activityTx = `0x${"aa".repeat(32)}` as Hex;
const peerTx = `0x${"bb".repeat(32)}` as Hex;

function summary(): EpochSummary {
  return {
    wallet,
    tokenId: 1n,
    chainId: 11155111n,
    fromBlock: 10n,
    toBlock: 20n,
    epochId,
    activityDigest: `0x${"33".repeat(32)}` as Hex,
    xpDelta: 100n,
    personalityDeltas: [0, 0, 0, 0, 0, 0, 0, 0],
    needDeltas: [0, 0, 0, 0, 0],
    categoryCounters: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };
}

function encounter(): PeerObservation {
  return {
    actorWallet: wallet,
    actorTokenId: 1n,
    peerWallet: peer,
    peerTokenId: 2n,
    chainId: 11155111n,
    blockNumber: 20n,
    encounterDigest,
  };
}

describe("runtime wiring", () => {
  it("drains activity and peer queues through separated signing/broadcast boundaries", async () => {
    const store = new DaemonStore(":memory:");
    store.putEpoch(summary());
    store.putPeerEncounter(encounter());
    const signer = privateKeyToAccount(`0x${"44".repeat(32)}`);
    const signedDeadlines: bigint[] = [];
    const gateway: RuntimeSubmissionGateway = {
      async activityNonce() { return 7n; },
      async peerNonce() { return 9n; },
      async epochConsumed() { return false; },
      async peerConsumed() { return false; },
      async broadcastActivity(signed) {
        signedDeadlines.push(signed.attestation.deadline);
        assert.equal(signed.attestation.nonce, 7n);
        assert.ok(signed.signature.startsWith("0x"));
        return activityTx;
      },
      async broadcastPeer(signed) {
        signedDeadlines.push(signed.attestation.deadline);
        assert.equal(signed.attestation.nonce, 9n);
        assert.ok(signed.signature.startsWith("0x"));
        return peerTx;
      },
      async waitForReceipt() { return "success"; },
    };

    try {
      const submit = createRuntimeSubmitter({
        store,
        oracleAddress: oracle,
        oracleSigner: signer,
        now: async () => 1_900_000_000n,
        gateway,
      });
      await submit();

      assert.deepEqual(signedDeadlines, [1_900_000_900n, 1_900_000_900n]);
      assert.deepEqual(store.pendingEpochs(), []);
      assert.deepEqual(store.pendingPeerEncounters(), []);
      assert.equal(store.getEpoch(epochId)?.submittedTxHash, activityTx);
    } finally {
      store.close();
    }
  });

  it("loads life candidates from the durable registry in stable token order", async () => {
    const store = new DaemonStore(":memory:");
    store.recordBirth(peer, 2n, 10n);
    store.recordBirth(wallet, 1n, 10n);
    const calls: bigint[] = [];
    try {
      const candidates = await loadLifeCandidates(store, async (tokenId) => {
        calls.push(tokenId);
        return {
          lastLifeTickAt: tokenId === 1n ? 100n : 200n,
          hibernating: tokenId === 2n,
        };
      });

      assert.deepEqual(calls, [1n, 2n]);
      assert.deepEqual(candidates, [
        { tokenId: 1n, initialized: true, lastLifeTickAt: 100n, hibernating: false },
        { tokenId: 2n, initialized: true, lastLifeTickAt: 200n, hibernating: true },
      ]);
    } finally {
      store.close();
    }
  });
});
