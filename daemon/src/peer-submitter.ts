import type { Address, Hex } from "viem";
import type { PeerAttestation, PeerObservation } from "./peer-attestation.js";
import { DaemonStore, type StoredPeerEncounter } from "./store.js";
import type { ReceiptStatus, SubmitStatus } from "./submitter.js";

export interface SignedPeer {
  attestation: PeerAttestation;
  signature: Hex;
}

export interface PeerSubmitResult {
  encounterDigest: Hex;
  status: SubmitStatus;
  txHash?: Hex;
  error?: unknown;
}

export interface PeerSubmitterDependencies {
  store: DaemonStore;
  sign: (observation: PeerObservation, nonce: bigint) => Promise<SignedPeer>;
  getNonce: (wallet: Address) => Promise<bigint>;
  isEncounterConsumed: (encounterDigest: Hex) => Promise<boolean>;
  broadcast: (signed: SignedPeer) => Promise<Hex>;
  waitForReceipt: (txHash: Hex) => Promise<ReceiptStatus>;
  maxBroadcastAttempts?: number;
}

async function recoverInflight(
  stored: StoredPeerEncounter,
  dependencies: PeerSubmitterDependencies,
): Promise<PeerSubmitResult | null> {
  const txHash = stored.broadcastTxHash;
  if (txHash === null) return null;

  let receipt: ReceiptStatus;
  try {
    receipt = await dependencies.waitForReceipt(txHash);
  } catch (error) {
    return {
      encounterDigest: stored.observation.encounterDigest,
      status: "pending-receipt",
      txHash,
      error,
    };
  }

  if (receipt === "success") {
    dependencies.store.markPeerSubmitted(stored.observation.encounterDigest, txHash);
    return {
      encounterDigest: stored.observation.encounterDigest,
      status: "submitted",
      txHash,
    };
  }

  dependencies.store.clearPeerBroadcast(stored.observation.encounterDigest, txHash);
  return null;
}

/**
 * Drains durable peer encounters with the same crash-safe semantics as activity
 * epochs: once a tx hash is persisted, restart resumes receipt tracking and is
 * not allowed to sign or broadcast a replacement transaction.
 */
export async function submitPendingPeerEncounters(
  dependencies: PeerSubmitterDependencies,
): Promise<PeerSubmitResult[]> {
  const maxBroadcastAttempts = dependencies.maxBroadcastAttempts ?? 3;
  if (!Number.isSafeInteger(maxBroadcastAttempts) || maxBroadcastAttempts <= 0) {
    throw new Error("maxBroadcastAttempts must be a positive safe integer");
  }

  const results: PeerSubmitResult[] = [];

  for (const stored of dependencies.store.pendingPeerEncounters()) {
    const recovered = await recoverInflight(stored, dependencies);
    if (recovered !== null) {
      results.push(recovered);
      continue;
    }

    if (await dependencies.isEncounterConsumed(stored.observation.encounterDigest)) {
      dependencies.store.markPeerConsumed(stored.observation.encounterDigest);
      results.push({
        encounterDigest: stored.observation.encounterDigest,
        status: "already-consumed",
      });
      continue;
    }

    const nonce = await dependencies.getNonce(stored.observation.actorWallet);
    const signed = await dependencies.sign(stored.observation, nonce);

    let txHash: Hex | null = null;
    let broadcastError: unknown;
    for (let attempt = 0; attempt < maxBroadcastAttempts; attempt += 1) {
      try {
        txHash = await dependencies.broadcast(signed);
        broadcastError = undefined;
        break;
      } catch (error) {
        broadcastError = error;
      }
    }

    if (txHash === null) {
      results.push({
        encounterDigest: stored.observation.encounterDigest,
        status: "broadcast-failed",
        error: broadcastError,
      });
      continue;
    }

    dependencies.store.markPeerBroadcast(stored.observation.encounterDigest, txHash);

    let receipt: ReceiptStatus;
    try {
      receipt = await dependencies.waitForReceipt(txHash);
    } catch (error) {
      results.push({
        encounterDigest: stored.observation.encounterDigest,
        status: "pending-receipt",
        txHash,
        error,
      });
      continue;
    }

    if (receipt === "success") {
      dependencies.store.markPeerSubmitted(stored.observation.encounterDigest, txHash);
      results.push({
        encounterDigest: stored.observation.encounterDigest,
        status: "submitted",
        txHash,
      });
      continue;
    }

    dependencies.store.clearPeerBroadcast(stored.observation.encounterDigest, txHash);
    results.push({
      encounterDigest: stored.observation.encounterDigest,
      status: "reverted",
      txHash,
    });
  }

  return results;
}
