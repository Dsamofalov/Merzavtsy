import {
  hashTypedData,
  keccak256,
  recoverTypedDataAddress,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { ACTIVITY_TYPES, activityDomain } from "./attestation.js";
import type { SignedActivity } from "./submitter.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export interface OpenActivityFeedEntry extends SignedActivity {
  signer: Address;
  valid: boolean;
  typedDataHash: Hex;
  leaf: Hex;
}

export interface ActivityAuditFinding {
  code:
    | "INVALID_SIGNATURE"
    | "DUPLICATE_EPOCH"
    | "DUPLICATE_DIGEST"
    | "OVERLAPPING_RANGE"
    | "INVALID_RANGE";
  index: number;
  detail: string;
}

export interface ActivityMerkleProof {
  root: Hex;
  siblings: Hex[];
}

export interface SelectiveActivityProofEntry {
  index: number;
  leaf: Hex;
  siblings: Hex[];
}

export interface SelectiveActivityProof {
  root: Hex;
  totalEntries: number;
  entries: SelectiveActivityProofEntry[];
}

export function parseAuditSignerAllowlist(env: NodeJS.ProcessEnv): Address[] {
  const raw = env.ORACLE_SIGNER_ADDRESSES?.trim() || env.ORACLE_SIGNER_ADDRESS?.trim();
  if (!raw) {
    throw new Error("ORACLE_SIGNER_ADDRESSES or ORACLE_SIGNER_ADDRESS is required for attestation audit");
  }

  const seen = new Set<string>();
  const result: Address[] = [];
  for (const item of raw.split(",")) {
    const value = item.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
      throw new Error("oracle signer allowlist contains an invalid address");
    }
    if (/^0x0{40}$/i.test(value)) {
      throw new Error("oracle signer address must be non-zero");
    }
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value as Address);
  }

  if (result.length === 0) {
    throw new Error("ORACLE_SIGNER_ADDRESSES must contain at least one authorized signer");
  }
  return result;
}

function canonicalLeaf(digest: Hex, signature: Hex): Hex {
  return keccak256(toHex(`${digest.toLowerCase()}:${signature.toLowerCase()}`));
}

function pairHash(a: Hex, b: Hex): Hex {
  const [first, second] = a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a];
  return keccak256(`0x${first.slice(2)}${second.slice(2)}` as Hex);
}

export async function buildOpenActivityFeed(
  signedArchive: readonly SignedActivity[],
  oracleAddress: Address,
  allowedSigners: readonly Address[] = [],
): Promise<OpenActivityFeedEntry[]> {
  const allowed = new Set(allowedSigners.map((item) => item.toLowerCase()));
  const result: OpenActivityFeedEntry[] = [];
  for (const signed of signedArchive) {
    const value = signed.attestation;
    const domain = activityDomain(value.chainId, oracleAddress);
    const typedDataHash = hashTypedData({
      domain,
      types: ACTIVITY_TYPES,
      primaryType: "ActivityAttestation",
      message: value,
    });
    let signer = ZERO_ADDRESS;
    let recovered = false;
    try {
      signer = await recoverTypedDataAddress({
        domain,
        types: ACTIVITY_TYPES,
        primaryType: "ActivityAttestation",
        message: value,
        signature: signed.signature,
      });
      recovered = true;
    } catch {
      recovered = false;
    }
    const signerAllowed = allowed.size === 0 || allowed.has(signer.toLowerCase());
    const valid = recovered && signerAllowed && value.fromBlock <= value.toBlock;
    result.push({
      attestation: value,
      signature: signed.signature,
      signer,
      valid,
      typedDataHash,
      leaf: canonicalLeaf(typedDataHash, signed.signature),
    });
  }
  return result;
}

export function auditActivityFeed(feed: readonly OpenActivityFeedEntry[]): ActivityAuditFinding[] {
  const findings: ActivityAuditFinding[] = [];
  const epochs = new Map<string, number>();
  const digests = new Map<string, number>();
  const ranges = new Map<string, Array<{ from: bigint; to: bigint; index: number }>>();

  for (let index = 0; index < feed.length; index += 1) {
    const entry = feed[index]!;
    const value = entry.attestation;
    if (!entry.valid) findings.push({ code: "INVALID_SIGNATURE", index, detail: "signature or authorized signer validation failed" });
    if (value.fromBlock > value.toBlock) findings.push({ code: "INVALID_RANGE", index, detail: "fromBlock exceeds toBlock" });

    const identity = `${value.chainId}:${value.wallet.toLowerCase()}:${value.tokenId}`;
    const epochKey = `${identity}:${value.epochId.toLowerCase()}`;
    const priorEpoch = epochs.get(epochKey);
    if (priorEpoch !== undefined) findings.push({ code: "DUPLICATE_EPOCH", index, detail: `duplicates feed entry ${priorEpoch}` });
    else epochs.set(epochKey, index);

    const digestKey = `${identity}:${value.activityDigest.toLowerCase()}`;
    const priorDigest = digests.get(digestKey);
    if (priorDigest !== undefined) findings.push({ code: "DUPLICATE_DIGEST", index, detail: `duplicates feed entry ${priorDigest}` });
    else digests.set(digestKey, index);

    const priorRanges = ranges.get(identity) ?? [];
    const overlap = priorRanges.find((range) => value.fromBlock <= range.to && value.toBlock >= range.from);
    if (overlap !== undefined) findings.push({ code: "OVERLAPPING_RANGE", index, detail: `overlaps feed entry ${overlap.index}` });
    priorRanges.push({ from: value.fromBlock, to: value.toBlock, index });
    ranges.set(identity, priorRanges);
  }

  return findings;
}

function merkleLevel(nodes: readonly Hex[]): Hex[] {
  if (nodes.length === 0) return [];
  const result: Hex[] = [];
  for (let index = 0; index < nodes.length; index += 2) {
    const left = nodes[index]!;
    const right = nodes[index + 1] ?? left;
    result.push(pairHash(left, right));
  }
  return result;
}

export function buildActivityMerkleProof(
  feed: readonly OpenActivityFeedEntry[],
  index: number,
): ActivityMerkleProof {
  if (!Number.isInteger(index) || index < 0 || index >= feed.length) throw new Error("Merkle proof index out of range");
  let position = index;
  let level = feed.map((entry) => entry.leaf);
  const siblings: Hex[] = [];
  while (level.length > 1) {
    const siblingIndex = position % 2 === 0 ? position + 1 : position - 1;
    siblings.push(level[siblingIndex] ?? level[position]!);
    level = merkleLevel(level);
    position = Math.floor(position / 2);
  }
  return { root: level[0]!, siblings };
}

export function activityMerkleRoot(feed: readonly OpenActivityFeedEntry[]): Hex {
  if (feed.length === 0) return keccak256(toHex("MERZAVTSY_EMPTY_ACTIVITY_FEED_V1"));
  let level = feed.map((entry) => entry.leaf);
  while (level.length > 1) level = merkleLevel(level);
  return level[0]!;
}

export function verifyActivityMerkleProof(leaf: Hex, siblings: readonly Hex[], root: Hex): boolean {
  let node = leaf;
  for (const sibling of siblings) node = pairHash(node, sibling);
  return node.toLowerCase() === root.toLowerCase();
}

/**
 * Build independent inclusion proofs for a caller-selected subset of the public feed.
 * This deliberately provides selective disclosure at entry granularity without introducing
 * a ZK circuit or changing the signed EIP-712 payload format.
 */
export function buildSelectiveActivityProof(
  feed: readonly OpenActivityFeedEntry[],
  indices: readonly number[],
): SelectiveActivityProof {
  if (feed.length === 0) throw new Error("cannot build a selective proof for an empty activity feed");
  if (indices.length === 0) throw new Error("selective activity proof requires at least one index");
  const unique = [...new Set(indices)];
  if (unique.length !== indices.length) throw new Error("selective activity proof indices must be unique");
  unique.sort((a, b) => a - b);
  const root = activityMerkleRoot(feed);
  const entries = unique.map((index) => {
    const proof = buildActivityMerkleProof(feed, index);
    if (proof.root.toLowerCase() !== root.toLowerCase()) throw new Error("inconsistent activity Merkle root");
    return { index, leaf: feed[index]!.leaf, siblings: proof.siblings };
  });
  return { root, totalEntries: feed.length, entries };
}

export function verifySelectiveActivityProof(proof: SelectiveActivityProof): boolean {
  if (!Number.isInteger(proof.totalEntries) || proof.totalEntries <= 0 || proof.entries.length === 0) return false;
  const seen = new Set<number>();
  let prior = -1;
  for (const entry of proof.entries) {
    if (!Number.isInteger(entry.index) || entry.index < 0 || entry.index >= proof.totalEntries) return false;
    if (seen.has(entry.index) || entry.index <= prior) return false;
    if (!verifyActivityMerkleProof(entry.leaf, entry.siblings, proof.root)) return false;
    seen.add(entry.index);
    prior = entry.index;
  }
  return true;
}
