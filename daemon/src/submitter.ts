import type { Hex } from "viem";
import type { ActivityAttestation } from "./attestation.js";
import { archiveSignedActivity } from "./signed-archive.js";
import { DaemonStore, type StoredEpoch } from "./store.js";
import type { EpochSummary } from "./types.js";

export interface SignedActivity {
  attestation: ActivityAttestation;
  signature: Hex;
}

export type ReceiptStatus = "success" | "reverted";
export type SubmitStatus =
  | "submitted"
  | "already-consumed"
  | "pending-receipt"
  | "broadcast-failed"
  | "reverted";

export interface SubmitResult {
  epochId: Hex;
  status: SubmitStatus;
  txHash?: Hex;
  error?: unknown;
}

export interface SubmitterDependencies {
  store: DaemonStore;
  sign: (summary: EpochSummary, nonce: bigint) => Promise<SignedActivity>;
  getNonce: (wallet: EpochSummary["wallet"]) => Promise<bigint>;
  isEpochConsumed: (tokenId: bigint, epochId: Hex) => Promise<boolean>;
  broadcast: (signed: SignedActivity) => Promise<Hex>;
  waitForReceipt: (txHash: Hex) => Promise<ReceiptStatus>;
  maxBroadcastAttempts?: number;
}

async function recoverInflight(
  stored: StoredEpoch,
  dependencies: SubmitterDependencies,
): Promise<SubmitResult | null> {
  const txHash = stored.broadcastTxHash;
  if (txHash === null) return null;

  let receipt: ReceiptStatus;
  try {
    receipt = await dependencies.waitForReceipt(txHash);
  } catch (error) {
    return {
      epochId: stored.summary.epochId,
      status: "pending-receipt",
      txHash,
      error,
    };
  }

  if (receipt === "success") {
    dependencies.store.markEpochSubmitted(stored.summary.epochId, txHash);
    return { epochId: stored.summary.epochId, status: "submitted", txHash };
  }

  dependencies.store.clearEpochBroadcast(stored.summary.epochId, txHash);
  return null;
}

/**
 * Drain durable pending epochs without ever replacing an unresolved broadcast.
 * The same SignedActivity object is reused across transient broadcast retries.
 * Once a tx hash exists it is persisted before receipt lookup, making a process
 * crash safe: restart resumes receipt tracking instead of creating a second tx.
 */
export async function submitPendingEpochs(
  dependencies: SubmitterDependencies,
): Promise<SubmitResult[]> {
  const maxBroadcastAttempts = dependencies.maxBroadcastAttempts ?? 3;
  if (!Number.isSafeInteger(maxBroadcastAttempts) || maxBroadcastAttempts <= 0) {
    throw new Error("maxBroadcastAttempts must be a positive safe integer");
  }

  const results: SubmitResult[] = [];

  for (const stored of dependencies.store.pendingEpochs()) {
    const recovered = await recoverInflight(stored, dependencies);
    if (recovered !== null) {
      results.push(recovered);
      continue;
    }

    if (
      await dependencies.isEpochConsumed(
        stored.summary.tokenId,
        stored.summary.epochId,
      )
    ) {
      dependencies.store.markEpochConsumed(stored.summary.epochId);
      results.push({
        epochId: stored.summary.epochId,
        status: "already-consumed",
      });
      continue;
    }

    const nonce = await dependencies.getNonce(stored.summary.wallet);
    const signed = await dependencies.sign(stored.summary, nonce);
    // Archive the exact public signed gameplay fact before any broadcast attempt.
    // The archive contains the payload/signature, never the oracle private key.
    archiveSignedActivity(dependencies.store, signed);

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
        epochId: stored.summary.epochId,
        status: "broadcast-failed",
        error: broadcastError,
      });
      continue;
    }

    dependencies.store.markEpochBroadcast(stored.summary.epochId, txHash);

    let receipt: ReceiptStatus;
    try {
      receipt = await dependencies.waitForReceipt(txHash);
    } catch (error) {
      results.push({
        epochId: stored.summary.epochId,
        status: "pending-receipt",
        txHash,
        error,
      });
      continue;
    }

    if (receipt === "success") {
      dependencies.store.markEpochSubmitted(stored.summary.epochId, txHash);
      results.push({
        epochId: stored.summary.epochId,
        status: "submitted",
        txHash,
      });
      continue;
    }

    dependencies.store.clearEpochBroadcast(stored.summary.epochId, txHash);
    results.push({
      epochId: stored.summary.epochId,
      status: "reverted",
      txHash,
    });
  }

  return results;
}