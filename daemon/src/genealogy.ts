import {
  hashTypedData,
  keccak256,
  recoverTypedDataAddress,
  toHex,
  type Address,
  type Hex,
} from "viem";

export type Genome = [number, number, number, number, number, number, number, number];

export interface BreedingConsent {
  parentATokenId: bigint;
  parentBTokenId: bigint;
  parentAOwner: Address;
  parentBOwner: Address;
  childSequence: bigint;
  nonce: bigint;
  deadline: bigint;
}

export const BREEDING_TYPES = {
  BreedingConsent: [
    { name: "parentATokenId", type: "uint256" },
    { name: "parentBTokenId", type: "uint256" },
    { name: "parentAOwner", type: "address" },
    { name: "parentBOwner", type: "address" },
    { name: "childSequence", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function genealogyDomain(chainId: bigint, identityAddress: Address) {
  if (chainId <= 0n) throw new Error("genealogy chainId must be positive");
  return {
    name: "Merzavtsy Genealogy" as const,
    version: "1" as const,
    chainId,
    verifyingContract: identityAddress,
  };
}

export interface VerifiedBreedingConsent extends BreedingConsent {
  digest: Hex;
}

export async function verifyBreedingConsent(options: {
  chainId: bigint;
  identityAddress: Address;
  consent: BreedingConsent;
  parentASignature: Hex;
  parentBSignature: Hex;
  now: bigint;
}): Promise<VerifiedBreedingConsent> {
  const { consent } = options;
  if (consent.parentATokenId <= 0n || consent.parentBTokenId <= 0n) {
    throw new Error("parent token ids must be positive");
  }
  if (consent.parentATokenId === consent.parentBTokenId) {
    throw new Error("breeding parents must be distinct creatures");
  }
  if (consent.parentAOwner.toLowerCase() === consent.parentBOwner.toLowerCase()) {
    throw new Error("breeding requires two distinct parent owners");
  }
  if (consent.nonce < 0n || consent.childSequence < 0n) {
    throw new Error("breeding nonce and child sequence must be non-negative");
  }
  if (options.now < 0n) throw new Error("current time must be non-negative");
  if (consent.deadline < options.now) throw new Error("breeding consent expired");

  const domain = genealogyDomain(options.chainId, options.identityAddress);
  const typed = {
    domain,
    types: BREEDING_TYPES,
    primaryType: "BreedingConsent" as const,
    message: consent,
  };
  const [recoveredA, recoveredB] = await Promise.all([
    recoverTypedDataAddress({ ...typed, signature: options.parentASignature }),
    recoverTypedDataAddress({ ...typed, signature: options.parentBSignature }),
  ]);
  if (recoveredA.toLowerCase() !== consent.parentAOwner.toLowerCase()) {
    throw new Error("parent A signature does not match parent A owner");
  }
  if (recoveredB.toLowerCase() !== consent.parentBOwner.toLowerCase()) {
    throw new Error("parent B signature does not match parent B owner");
  }

  return {
    ...consent,
    digest: hashTypedData(typed),
  };
}

export interface GenealogyParent {
  tokenId: bigint;
  genomeSeed: Hex;
  genome: Genome;
  mutationMask: bigint;
}

export interface DescendantPlan {
  parentATokenId: bigint;
  parentBTokenId: bigint;
  consentDigest: Hex;
  genomeSeed: Hex;
  genome: Genome;
  mutationSeed: Hex;
  inheritedMutationMask: bigint;
}

function clampAxis(value: number): number {
  return Math.max(0, Math.min(10_000, Math.trunc(value)));
}

function deterministicNumber(seed: Hex, label: string): bigint {
  return BigInt(keccak256(toHex(`${seed.toLowerCase()}:${label}`)));
}

function validateParent(parent: GenealogyParent, expectedTokenId: bigint): void {
  if (parent.tokenId !== expectedTokenId) throw new Error("genealogy parent token does not match consent");
  if (!/^0x[0-9a-fA-F]{64}$/.test(parent.genomeSeed)) throw new Error("parent genome seed must be bytes32");
  if (parent.genome.length !== 8 || parent.genome.some((value) => !Number.isInteger(value) || value < 0 || value > 10_000)) {
    throw new Error("parent genome must contain eight bounded integer axes");
  }
  if (parent.mutationMask < 0n) throw new Error("parent mutation mask must be non-negative");
}

function inheritedMutations(parentA: bigint, parentB: bigint, mutationSeed: Hex): bigint {
  const shared = parentA & parentB;
  const unique = parentA ^ parentB;
  let inherited = shared;
  for (let index = 0; index < 256; index += 1) {
    const bit = 1n << BigInt(index);
    if ((unique & bit) === 0n) continue;
    // Unique parental traits are inherited rarely and deterministically.
    if (deterministicNumber(mutationSeed, `mutation:${index}`) % 4n === 0n) inherited |= bit;
  }
  return inherited;
}

export function deriveDescendant(options: {
  verifiedConsent: VerifiedBreedingConsent;
  parentA: GenealogyParent;
  parentB: GenealogyParent;
}): DescendantPlan {
  const consent = options.verifiedConsent;
  validateParent(options.parentA, consent.parentATokenId);
  validateParent(options.parentB, consent.parentBTokenId);

  const genomeSeed = keccak256(toHex([
    "MERZAVTSY_DESCENDANT_V1",
    options.parentA.genomeSeed.toLowerCase(),
    options.parentB.genomeSeed.toLowerCase(),
    consent.digest.toLowerCase(),
    consent.childSequence.toString(),
  ].join(":")));
  const mutationSeed = keccak256(toHex(`${genomeSeed}:mutation`));

  const genome = Array.from({ length: 8 }, (_, index) => {
    const midpoint = Math.trunc((options.parentA.genome[index]! + options.parentB.genome[index]!) / 2);
    const jitter = Number(deterministicNumber(genomeSeed, `axis:${index}`) % 1001n) - 500;
    return clampAxis(midpoint + jitter);
  }) as Genome;

  return {
    parentATokenId: consent.parentATokenId,
    parentBTokenId: consent.parentBTokenId,
    consentDigest: consent.digest,
    genomeSeed,
    genome,
    mutationSeed,
    inheritedMutationMask: inheritedMutations(
      options.parentA.mutationMask,
      options.parentB.mutationMask,
      mutationSeed,
    ),
  };
}

export interface GenealogyRecord {
  childTokenId: bigint;
  parentATokenId: bigint;
  parentBTokenId: bigint;
  consentDigest: Hex;
}

/**
 * Minimal deterministic ancestry registry for the post-MVP genealogy layer.
 * It is intentionally non-financial: no prices, yield, rarity payments or custody exist here.
 */
export class GenealogyBook {
  readonly #records = new Map<bigint, GenealogyRecord>();
  readonly #usedConsent = new Set<string>();

  record(childTokenId: bigint, parentATokenId: bigint, parentBTokenId: bigint, consentDigest: Hex): void {
    if (childTokenId <= 0n || parentATokenId <= 0n || parentBTokenId <= 0n) {
      throw new Error("genealogy token ids must be positive");
    }
    if (childTokenId === parentATokenId || childTokenId === parentBTokenId || parentATokenId === parentBTokenId) {
      throw new Error("genealogy record would create an invalid self-parent relation");
    }
    if (this.#records.has(childTokenId)) throw new Error(`child ${childTokenId} already has genealogy`);
    const digestKey = consentDigest.toLowerCase();
    if (this.#usedConsent.has(digestKey)) throw new Error("breeding consent replay detected");

    if (this.#isAncestor(childTokenId, parentATokenId) || this.#isAncestor(childTokenId, parentBTokenId)) {
      throw new Error("genealogy cycle detected");
    }

    this.#records.set(childTokenId, { childTokenId, parentATokenId, parentBTokenId, consentDigest });
    this.#usedConsent.add(digestKey);
  }

  recordOf(childTokenId: bigint): GenealogyRecord | null {
    return this.#records.get(childTokenId) ?? null;
  }

  ancestorsOf(childTokenId: bigint): bigint[] {
    const seen = new Set<bigint>();
    const visit = (tokenId: bigint): void => {
      const record = this.#records.get(tokenId);
      if (record === undefined) return;
      for (const parent of [record.parentATokenId, record.parentBTokenId]) {
        if (seen.has(parent)) continue;
        seen.add(parent);
        visit(parent);
      }
    };
    visit(childTokenId);
    return [...seen].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  }

  #isAncestor(candidate: bigint, tokenId: bigint): boolean {
    if (candidate === tokenId) return true;
    const record = this.#records.get(tokenId);
    if (record === undefined) return false;
    return this.#isAncestor(candidate, record.parentATokenId)
      || this.#isAncestor(candidate, record.parentBTokenId);
  }
}
