import type { Address, Hex, LocalAccount } from "viem";
import { buildAttestation, signAttestation } from "./attestation.js";
import type { LifeTickCandidate } from "./life-keeper.js";
import { buildPeerAttestation, signPeerAttestation } from "./peer-attestation.js";
import { submitPendingPeerEncounters, type SignedPeer } from "./peer-submitter.js";
import { DaemonStore } from "./store.js";
import {
  submitPendingEpochs,
  type ReceiptStatus,
  type SignedActivity,
} from "./submitter.js";

export const ATTESTATION_TTL_SECONDS = 15n * 60n;

export interface RuntimeSubmissionGateway {
  activityNonce(wallet: Address): Promise<bigint>;
  peerNonce(wallet: Address): Promise<bigint>;
  epochConsumed(tokenId: bigint, epochId: Hex): Promise<boolean>;
  peerConsumed(encounterDigest: Hex): Promise<boolean>;
  broadcastActivity(signed: SignedActivity): Promise<Hex>;
  broadcastPeer(signed: SignedPeer): Promise<Hex>;
  waitForReceipt(txHash: Hex): Promise<ReceiptStatus>;
}

export interface RuntimeSubmitterOptions {
  store: DaemonStore;
  oracleAddress: Address;
  oracleSigner: LocalAccount;
  now(): Promise<bigint>;
  gateway: RuntimeSubmissionGateway;
}

/**
 * Connects durable queues to the pure signing/submission primitives. The oracle
 * account is used only for EIP-712 signing; transaction broadcasting remains a
 * separate gateway responsibility so the submitter key never gains oracle role.
 */
export function createRuntimeSubmitter(
  options: RuntimeSubmitterOptions,
): () => Promise<void> {
  return async () => {
    const now = await options.now();
    if (now < 0n) throw new Error("runtime time must be non-negative");
    const deadline = now + ATTESTATION_TTL_SECONDS;

    await submitPendingEpochs({
      store: options.store,
      getNonce: (wallet) => options.gateway.activityNonce(wallet),
      isEpochConsumed: (tokenId, epochId) => options.gateway.epochConsumed(tokenId, epochId),
      sign: async (summary, nonce) => {
        const attestation = buildAttestation(summary, nonce, deadline);
        return {
          attestation,
          signature: await signAttestation(
            options.oracleSigner,
            options.oracleAddress,
            attestation,
          ),
        };
      },
      broadcast: (signed) => options.gateway.broadcastActivity(signed),
      waitForReceipt: (txHash) => options.gateway.waitForReceipt(txHash),
    });

    await submitPendingPeerEncounters({
      store: options.store,
      getNonce: (wallet) => options.gateway.peerNonce(wallet),
      isEncounterConsumed: (encounterDigest) => options.gateway.peerConsumed(encounterDigest),
      sign: async (observation, nonce) => {
        const attestation = buildPeerAttestation(observation, nonce, deadline);
        return {
          attestation,
          signature: await signPeerAttestation(
            options.oracleSigner,
            options.oracleAddress,
            attestation,
          ),
        };
      },
      broadcast: (signed) => options.gateway.broadcastPeer(signed),
      waitForReceipt: (txHash) => options.gateway.waitForReceipt(txHash),
    });
  };
}

export interface LifeStateSnapshot {
  lastLifeTickAt: bigint;
  hibernating: boolean;
}

export async function loadLifeCandidates(
  store: DaemonStore,
  readState: (tokenId: bigint) => Promise<LifeStateSnapshot>,
): Promise<LifeTickCandidate[]> {
  const candidates: LifeTickCandidate[] = [];
  for (const creature of store.registeredCreatures()) {
    const state = await readState(creature.tokenId);
    if (state.lastLifeTickAt < 0n) {
      throw new Error(`negative lastLifeTickAt for token ${creature.tokenId}`);
    }
    candidates.push({
      tokenId: creature.tokenId,
      initialized: true,
      lastLifeTickAt: state.lastLifeTickAt,
      hibernating: state.hibernating,
    });
  }
  return candidates;
}
