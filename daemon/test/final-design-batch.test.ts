import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { keccak256, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  BREEDING_TYPES,
  deriveDescendant,
  genealogyDomain,
  GenealogyBook,
  verifyBreedingConsent,
  type BreedingConsent,
} from "../src/genealogy.js";
import {
  buildSelectiveActivityProof,
  verifySelectiveActivityProof,
  type OpenActivityFeedEntry,
} from "../src/activity-feed.js";
import { validateSepoliaSmokeTarget } from "../src/sepolia-smoke.js";

const identity = "0x9999999999999999999999999999999999999999" as Address;
const parentAKey = `0x${"11".repeat(32)}` as Hex;
const parentBKey = `0x${"22".repeat(32)}` as Hex;
const parentA = privateKeyToAccount(parentAKey);
const parentB = privateKeyToAccount(parentBKey);

function fakeFeed(leaves: Hex[]): OpenActivityFeedEntry[] {
  return leaves.map((leaf, index) => ({
    attestation: {
      wallet: identity,
      tokenId: BigInt(index + 1),
      chainId: 1n,
      fromBlock: BigInt(index * 10 + 1),
      toBlock: BigInt(index * 10 + 9),
      epochId: keccak256(toHex(`epoch-${index}`)),
      activityDigest: keccak256(toHex(`activity-${index}`)),
      xpDelta: 0n,
      personalityDeltas: [0,0,0,0,0,0,0,0],
      needDeltas: [0,0,0,0,0],
      categoryCounters: [0,0,0,0,0,0,0,0,0,0],
      nonce: BigInt(index),
      deadline: 4_000_000_000n,
    },
    signature: `0x${"11".repeat(65)}` as Hex,
    signer: identity,
    valid: true,
    typedDataHash: keccak256(toHex(`typed-${index}`)),
    leaf,
  }));
}

describe("genealogy extension", () => {
  it("requires cryptographic consent from both parents and derives deterministic inherited genome + mutation seed", async () => {
    const chainId = 1n;
    const consent: BreedingConsent = {
      parentATokenId: 1n,
      parentBTokenId: 2n,
      parentAOwner: parentA.address,
      parentBOwner: parentB.address,
      childSequence: 7n,
      nonce: 3n,
      deadline: 2_000_000_000n,
    };
    const domain = genealogyDomain(chainId, identity);
    const parentASignature = await parentA.signTypedData({
      domain,
      types: BREEDING_TYPES,
      primaryType: "BreedingConsent",
      message: consent,
    });
    const parentBSignature = await parentB.signTypedData({
      domain,
      types: BREEDING_TYPES,
      primaryType: "BreedingConsent",
      message: consent,
    });
    const verified = await verifyBreedingConsent({
      chainId,
      identityAddress: identity,
      consent,
      parentASignature,
      parentBSignature,
      now: 1_900_000_000n,
    });
    assert.equal(verified.parentAOwner.toLowerCase(), parentA.address.toLowerCase());
    assert.equal(verified.parentBOwner.toLowerCase(), parentB.address.toLowerCase());

    const first = deriveDescendant({
      verifiedConsent: verified,
      parentA: {
        tokenId: 1n,
        genomeSeed: keccak256(toHex("parent-a")),
        genome: [1000,2000,3000,4000,5000,6000,7000,8000],
        mutationMask: 0b1011n,
      },
      parentB: {
        tokenId: 2n,
        genomeSeed: keccak256(toHex("parent-b")),
        genome: [8000,7000,6000,5000,4000,3000,2000,1000],
        mutationMask: 0b1101n,
      },
    });
    const repeat = deriveDescendant({
      verifiedConsent: verified,
      parentA: {
        tokenId: 1n,
        genomeSeed: keccak256(toHex("parent-a")),
        genome: [1000,2000,3000,4000,5000,6000,7000,8000],
        mutationMask: 0b1011n,
      },
      parentB: {
        tokenId: 2n,
        genomeSeed: keccak256(toHex("parent-b")),
        genome: [8000,7000,6000,5000,4000,3000,2000,1000],
        mutationMask: 0b1101n,
      },
    });
    assert.deepEqual(first, repeat);
    assert.match(first.genomeSeed, /^0x[0-9a-f]{64}$/);
    assert.match(first.mutationSeed, /^0x[0-9a-f]{64}$/);
    assert.equal(first.genome.length, 8);
    assert.ok(first.genome.every((value) => value >= 0 && value <= 10_000));
    assert.notEqual(first.inheritedMutationMask & 0b1001n, 0n, "shared parental mutations must remain inheritable");
  });

  it("rejects single-party/expired consent and maintains a replay-safe ancestry graph", async () => {
    const chainId = 1n;
    const consent: BreedingConsent = {
      parentATokenId: 1n,
      parentBTokenId: 2n,
      parentAOwner: parentA.address,
      parentBOwner: parentB.address,
      childSequence: 1n,
      nonce: 0n,
      deadline: 2_000_000_000n,
    };
    const domain = genealogyDomain(chainId, identity);
    const sigA = await parentA.signTypedData({ domain, types: BREEDING_TYPES, primaryType: "BreedingConsent", message: consent });
    const sigB = await parentB.signTypedData({ domain, types: BREEDING_TYPES, primaryType: "BreedingConsent", message: consent });
    await assert.rejects(() => verifyBreedingConsent({
      chainId, identityAddress: identity, consent, parentASignature: sigA, parentBSignature: sigA, now: 1_900_000_000n,
    }), /parent B/i);
    await assert.rejects(() => verifyBreedingConsent({
      chainId, identityAddress: identity, consent, parentASignature: sigA, parentBSignature: sigB, now: 2_000_000_001n,
    }), /expired/i);

    const verified = await verifyBreedingConsent({
      chainId, identityAddress: identity, consent, parentASignature: sigA, parentBSignature: sigB, now: 1_900_000_000n,
    });
    const book = new GenealogyBook();
    book.record(10n, 1n, 2n, verified.digest);
    book.record(11n, 10n, 3n, keccak256(toHex("second-consent")));
    assert.deepEqual(book.ancestorsOf(11n), [1n, 2n, 3n, 10n]);
    assert.throws(() => book.record(12n, 4n, 5n, verified.digest), /consent.*replay/i);
  });
});

describe("selective activity proofs", () => {
  it("builds one root with independently verifiable proofs for only the selected feed entries", () => {
    const feed = fakeFeed([
      keccak256(toHex("leaf-a")),
      keccak256(toHex("leaf-b")),
      keccak256(toHex("leaf-c")),
      keccak256(toHex("leaf-d")),
    ]);
    const proof = buildSelectiveActivityProof(feed, [1, 3]);
    assert.deepEqual(proof.entries.map((entry) => entry.index), [1, 3]);
    assert.equal(verifySelectiveActivityProof(proof), true);
    assert.equal(proof.entries.some((entry) => entry.index === 0), false);
  });
});

describe("release closure artifacts", () => {
  it("ships a Sepolia-only smoke target and operator proof procedure", () => {
    assert.equal(validateSepoliaSmokeTarget(11155111n), 11155111n);
    assert.throws(() => validateSepoliaSmokeTarget(1n), /Sepolia/i);
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    assert.equal(pkg.scripts["smoke:sepolia"], "node --import tsx scripts/sepolia-smoke.ts");
    const doc = readFileSync(new URL("../../docs/SEPOLIA_SMOKE.md", import.meta.url), "utf8");
    assert.match(doc, /11155111/);
    assert.match(doc, /proof/i);
  });

  it("documents canonical replay/recovery, accepted low dependency risk, and the deliberate local-store MVP boundary", () => {
    const replay = readFileSync(new URL("../../docs/REPRODUCIBILITY.md", import.meta.url), "utf8");
    assert.match(replay, /replay/i);
    assert.match(replay, /crash|restart/i);
    assert.match(replay, /activityDigest|epochId/);

    const risk = readFileSync(new URL("../../docs/DEPENDENCY_RISK.md", import.meta.url), "utf8");
    assert.match(risk, /GHSA-848j-6mx2-7j84/);
    assert.match(risk, /low severity/i);
    assert.match(risk, /no fix/i);

    const storage = readFileSync(new URL("../../docs/STORAGE.md", import.meta.url), "utf8");
    assert.match(storage, /SQLite/);
    assert.match(storage, /PostgreSQL/);
    assert.match(storage, /not required|out of scope/i);
  });
});
