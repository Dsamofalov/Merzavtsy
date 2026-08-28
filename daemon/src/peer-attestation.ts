import type { Address, Hex, LocalAccount } from "viem";
import { activityDomain } from "./attestation.js";

export interface PeerObservation {
  actorWallet: Address;
  actorTokenId: bigint;
  peerWallet: Address;
  peerTokenId: bigint;
  chainId: bigint;
  blockNumber: bigint;
  encounterDigest: Hex;
}

export interface PeerAttestation extends PeerObservation {
  nonce: bigint;
  deadline: bigint;
}

export const PEER_TYPES = {
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

export function buildPeerAttestation(
  observation: PeerObservation,
  nonce: bigint,
  deadline: bigint,
): PeerAttestation {
  if (observation.actorTokenId === observation.peerTokenId) {
    throw new Error("peer encounter requires distinct tokens");
  }
  if (observation.actorWallet.toLowerCase() === observation.peerWallet.toLowerCase()) {
    throw new Error("peer encounter requires distinct wallets");
  }
  if (nonce < 0n || deadline < 0n || observation.blockNumber < 0n) {
    throw new Error("peer attestation integers must be non-negative");
  }

  return { ...observation, nonce, deadline };
}

export async function signPeerAttestation(
  account: LocalAccount,
  oracleAddress: Address,
  attestation: PeerAttestation,
): Promise<Hex> {
  return account.signTypedData({
    domain: activityDomain(attestation.chainId, oracleAddress),
    types: PEER_TYPES,
    primaryType: "PeerAttestation",
    message: attestation,
  });
}
