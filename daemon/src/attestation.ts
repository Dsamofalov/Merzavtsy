import type { Address, Hex, LocalAccount } from "viem";
import type { EpochSummary, NeedDeltas, PersonalityDeltas, CategoryCounters } from "./types.js";

export interface ActivityAttestation {
  wallet: Address;
  tokenId: bigint;
  chainId: bigint;
  fromBlock: bigint;
  toBlock: bigint;
  epochId: Hex;
  activityDigest: Hex;
  xpDelta: bigint;
  personalityDeltas: PersonalityDeltas;
  needDeltas: NeedDeltas;
  categoryCounters: CategoryCounters;
  nonce: bigint;
  deadline: bigint;
}

export const ACTIVITY_TYPES = {
  ActivityAttestation: [
    { name: "wallet", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "chainId", type: "uint256" },
    { name: "fromBlock", type: "uint64" },
    { name: "toBlock", type: "uint64" },
    { name: "epochId", type: "bytes32" },
    { name: "activityDigest", type: "bytes32" },
    { name: "xpDelta", type: "uint64" },
    { name: "personalityDeltas", type: "int16[8]" },
    { name: "needDeltas", type: "int16[5]" },
    { name: "categoryCounters", type: "uint16[10]" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function activityDomain(chainId: bigint, oracleAddress: Address) {
  return {
    name: "Merzavtsy Activity Oracle" as const,
    version: "1" as const,
    chainId,
    verifyingContract: oracleAddress,
  };
}

export function buildAttestation(
  summary: EpochSummary,
  nonce: bigint,
  deadline: bigint,
): ActivityAttestation {
  if (nonce < 0n) throw new Error("nonce must be non-negative");
  if (deadline < 0n) throw new Error("deadline must be non-negative");

  return {
    wallet: summary.wallet,
    tokenId: summary.tokenId,
    chainId: summary.chainId,
    fromBlock: summary.fromBlock,
    toBlock: summary.toBlock,
    epochId: summary.epochId,
    activityDigest: summary.activityDigest,
    xpDelta: summary.xpDelta,
    personalityDeltas: [...summary.personalityDeltas] as PersonalityDeltas,
    needDeltas: [...summary.needDeltas] as NeedDeltas,
    categoryCounters: [...summary.categoryCounters] as CategoryCounters,
    nonce,
    deadline,
  };
}

export async function signAttestation(
  account: LocalAccount,
  oracleAddress: Address,
  attestation: ActivityAttestation,
): Promise<Hex> {
  return account.signTypedData({
    domain: activityDomain(attestation.chainId, oracleAddress),
    types: ACTIVITY_TYPES,
    primaryType: "ActivityAttestation",
    message: attestation,
  });
}
