import type { Address, Hex, LocalAccount } from "viem";
import { activityDomain } from "./attestation.js";
import type { EpochSummary, MutationCounters } from "./types.js";

export interface MutationMetricsAttestation {
  wallet: Address;
  tokenId: bigint;
  chainId: bigint;
  epochId: Hex;
  activityDigest: Hex;
  mutationCounters: MutationCounters;
  nonce: bigint;
  deadline: bigint;
}

export const MUTATION_METRICS_TYPES = {
  MutationMetricsAttestation: [
    { name: "wallet", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "chainId", type: "uint256" },
    { name: "epochId", type: "bytes32" },
    { name: "activityDigest", type: "bytes32" },
    { name: "mutationCounters", type: "uint16[4]" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function buildMutationMetricsAttestation(
  summary: EpochSummary,
  nonce: bigint,
  deadline: bigint,
): MutationMetricsAttestation {
  if (nonce < 0n) throw new Error("mutation nonce must be non-negative");
  if (deadline < 0n) throw new Error("mutation deadline must be non-negative");
  const counters: MutationCounters = summary.mutationCounters === undefined
    ? [0, 0, 0, 0]
    : [...summary.mutationCounters] as MutationCounters;
  return {
    wallet: summary.wallet,
    tokenId: summary.tokenId,
    chainId: summary.chainId,
    epochId: summary.epochId,
    activityDigest: summary.activityDigest,
    mutationCounters: counters,
    nonce,
    deadline,
  };
}

export async function signMutationMetricsAttestation(
  account: LocalAccount,
  oracleAddress: Address,
  attestation: MutationMetricsAttestation,
): Promise<Hex> {
  return account.signTypedData({
    domain: activityDomain(attestation.chainId, oracleAddress),
    types: MUTATION_METRICS_TYPES,
    primaryType: "MutationMetricsAttestation",
    message: attestation,
  });
}
