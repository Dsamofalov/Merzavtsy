import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { keccak256, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ACTIVITY_TYPES, activityDomain, type ActivityAttestation } from "../src/attestation.js";
import {
  classifyProtocolPlace,
  coOccurrenceMeetings,
  familiarPlaces,
  territoryAffinity,
  type PlaceVisit,
  type ProtocolPlaceDefinition,
} from "../src/places.js";
import {
  discoverPacks,
  inferPackRelations,
  packMigrationSuggestions,
  type PackMemberSignal,
  type SocialEdge,
} from "../src/packs.js";
import {
  applyGossipEffect,
  buildGossipOpinion,
  gossipEventPayload,
  relationshipDisposition,
} from "../src/gossip.js";
import {
  auditActivityFeed,
  buildActivityMerkleProof,
  buildOpenActivityFeed,
  verifyActivityMerkleProof,
} from "../src/activity-feed.js";
import type { SignedActivity } from "../src/submitter.js";

const market = "0x1111111111111111111111111111111111111111" as Address;
const port = "0x2222222222222222222222222222222222222222" as Address;
const gallery = "0x3333333333333333333333333333333333333333" as Address;
const den = "0x4444444444444444444444444444444444444444" as Address;
const other = "0x5555555555555555555555555555555555555555" as Address;
const oracle = "0x9999999999999999999999999999999999999999" as Address;

const catalog: ProtocolPlaceDefinition[] = [
  { address: market, tags: ["dex", "amm"] },
  { address: port, tags: ["bridge"] },
  { address: gallery, tags: ["nft", "marketplace"] },
  { address: den, tags: ["game"] },
];

function visit(tokenId: bigint, address: Address, timestamp: bigint): PlaceVisit {
  return { tokenId, address, blockNumber: timestamp / 12n, timestamp };
}

function edge(a: bigint, b: bigint, weight: number, affinity: number): SocialEdge {
  return { a, b, weight, affinity };
}

describe("places and territories extension", () => {
  it("maps protocol metadata into the four approved semantic place kinds", () => {
    assert.equal(classifyProtocolPlace(["DEX", "swap"]), "market");
    assert.equal(classifyProtocolPlace(["canonical-bridge"]), "port");
    assert.equal(classifyProtocolPlace(["NFT", "erc721"]), "gallery");
    assert.equal(classifyProtocolPlace(["onchain-game"]), "den");
    assert.equal(classifyProtocolPlace(["lending"]), "unknown");
  });

  it("derives familiar protocol locations and bounded territory affinity from durable visits", () => {
    const visits = [
      visit(1n, market, 1000n), visit(1n, market, 1300n), visit(1n, market, 1600n),
      visit(1n, port, 2200n), visit(1n, other, 2500n),
    ];
    const familiar = familiarPlaces(visits, 1n, catalog);
    assert.equal(familiar.length, 1);
    assert.equal(familiar[0]!.address, market);
    assert.equal(familiar[0]!.kind, "market");
    assert.ok(familiar[0]!.familiarity > 0 && familiar[0]!.familiarity <= 10_000);

    const affinity = territoryAffinity(visits, 1n, catalog);
    assert.ok(affinity.market > affinity.port);
    assert.ok(Object.values(affinity).every((value) => value >= 0 && value <= 10_000));
  });

  it("finds deterministic co-occurrence meetings at the same place and time bucket", () => {
    const visits = [
      visit(1n, market, 1000n), visit(2n, market, 1010n), visit(3n, market, 1400n),
      visit(1n, port, 2000n), visit(2n, port, 2400n),
    ];
    const meetings = coOccurrenceMeetings(visits, 300n);
    assert.deepEqual(meetings.map((item) => [item.a, item.b, item.address, item.count]), [[1n, 2n, market, 1]]);
  });
});

describe("emergent packs extension", () => {
  const edges: SocialEdge[] = [
    edge(1n, 2n, 8, 700), edge(2n, 3n, 7, 500), edge(1n, 3n, 6, 400),
    edge(4n, 5n, 9, 800), edge(3n, 4n, 2, -900), edge(2n, 5n, 1, -700),
  ];
  const members: PackMemberSignal[] = [
    { tokenId: 1n, reputation: 8000, territory: { market: 9000, port: 1000 } },
    { tokenId: 2n, reputation: 7000, territory: { market: 8000, port: 1500 } },
    { tokenId: 3n, reputation: 6000, territory: { market: 7000, gallery: 1000 } },
    { tokenId: 4n, reputation: 3000, territory: { den: 9000 } },
    { tokenId: 5n, reputation: 4000, territory: { den: 8000 } },
  ];

  it("discovers stable social clusters and derives emergent names, reputation, territory and cohesion", () => {
    const packs = discoverPacks(edges, members, 5);
    assert.equal(packs.length, 2);
    assert.deepEqual(packs[0]!.members, [1n, 2n, 3n]);
    assert.deepEqual(packs[1]!.members, [4n, 5n]);
    assert.match(packs[0]!.name, /рын|market|базар/i);
    assert.equal(packs[0]!.reputation, 7000);
    assert.equal(packs[0]!.territory, "market");
    assert.ok(packs[0]!.territoryAffinity > 0 && packs[0]!.territoryAffinity <= 10_000);
    assert.ok(packs[0]!.cohesion > 0 && packs[0]!.cohesion <= 10_000);
  });

  it("infers bounded rival-pack relations from hostile cross-cluster social evidence", () => {
    const packs = discoverPacks(edges, members, 5);
    const relations = inferPackRelations(packs, edges);
    assert.equal(relations.length, 1);
    assert.ok(relations[0]!.rivalry > 0 && relations[0]!.rivalry <= 10_000);
    assert.ok(relations[0]!.affinity < 0);
  });

  it("suggests migrations only when a member has materially stronger external ties", () => {
    const migrationEdges = [...edges, edge(3n, 4n, 20, 900), edge(3n, 5n, 18, 800)];
    const packs = discoverPacks(edges, members, 5);
    const suggestions = packMigrationSuggestions(packs, migrationEdges);
    assert.ok(suggestions.some((item) => item.tokenId === 3n && item.toPackId === packs[1]!.id));
  });
});

describe("structured gossip and social memory", () => {
  it("propagates a deterministic compact opinion with bounded structured relationship effects", () => {
    const opinion = buildGossipOpinion({
      speakerTokenId: 1n,
      subjectTokenId: 2n,
      recipientTokenId: 3n,
      speakerToSubject: { affinity: 1800, trust: 1400, fear: 0, respect: 900, envy: 100, rivalry: 50 },
      speakerToRecipient: { affinity: 1200, trust: 1600, fear: 0, respect: 400, envy: 0, rivalry: 0 },
      recipientToSubject: { affinity: 0, trust: 0, fear: 0, respect: 0, envy: 0, rivalry: 0 },
      memoryBias: 7500,
      seed: keccak256(toHex("gossip-seed")),
    });
    assert.equal(opinion.disposition, "favor");
    assert.ok(opinion.confidence > 0 && opinion.confidence <= 10_000);
    assert.ok(Math.abs(opinion.effect.affinity) <= 500);
    const applied = applyGossipEffect({ affinity: 0, trust: 0, fear: 0, respect: 0, envy: 0, rivalry: 0 }, opinion.effect);
    assert.ok(applied.affinity > 0);
    assert.equal(gossipEventPayload(opinion).kind, "GOSSIP_OPINION");
  });

  it("projects explicit grudges and favors from bounded relationship state", () => {
    assert.equal(relationshipDisposition({ affinity: 1400, trust: 1000, fear: 0, respect: 0, envy: 0, rivalry: 0 }), "favor");
    assert.equal(relationshipDisposition({ affinity: -1200, trust: -500, fear: 500, respect: 0, envy: 100, rivalry: 1700 }), "grudge");
    assert.equal(relationshipDisposition({ affinity: 0, trust: 0, fear: 0, respect: 0, envy: 0, rivalry: 0 }), "neutral");
  });
});

describe("open signed activity feed and audit proofs", () => {
  const privateKey = `0x${"11".repeat(32)}` as Hex;
  const account = privateKeyToAccount(privateKey);
  const attestation: ActivityAttestation = {
    wallet: market,
    tokenId: 1n,
    chainId: 1n,
    fromBlock: 100n,
    toBlock: 120n,
    epochId: keccak256(toHex("feed-epoch-1")),
    activityDigest: keccak256(toHex("feed-activity-1")),
    xpDelta: 50n,
    personalityDeltas: [1, 0, 0, 0, 0, 0, 0, 0],
    needDeltas: [0, 0, -10, 5, 0],
    categoryCounters: [1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    nonce: 0n,
    deadline: 4_000_000_000n,
  };

  async function signed(value: ActivityAttestation = attestation): Promise<SignedActivity> {
    const signature = await account.signTypedData({
      domain: activityDomain(value.chainId, oracle),
      types: ACTIVITY_TYPES,
      primaryType: "ActivityAttestation",
      message: value,
    });
    return { attestation: value, signature };
  }

  it("exports a publicly verifiable signed feed with recovered signer identity", async () => {
    const feed = await buildOpenActivityFeed([await signed()], oracle, [account.address]);
    assert.equal(feed.length, 1);
    assert.equal(feed[0]!.signer.toLowerCase(), account.address.toLowerCase());
    assert.equal(feed[0]!.valid, true);
    assert.match(feed[0]!.leaf, /^0x[0-9a-f]{64}$/);
  });

  it("audits duplicate/tampered feed entries and emits challenge findings", async () => {
    const good = await signed();
    const tampered = await signed({ ...attestation, epochId: keccak256(toHex("tampered")), xpDelta: 999n });
    const feed = await buildOpenActivityFeed([good, good, tampered], oracle, [account.address]);
    const findings = auditActivityFeed(feed);
    assert.ok(findings.some((item) => item.code === "DUPLICATE_EPOCH"));
    assert.ok(findings.some((item) => item.code === "OVERLAPPING_RANGE"));
  });

  it("builds and verifies selective Merkle inclusion proofs without introducing a ZK system", async () => {
    const second = { ...attestation, fromBlock: 121n, toBlock: 140n, nonce: 1n, epochId: keccak256(toHex("feed-epoch-2")), activityDigest: keccak256(toHex("feed-activity-2")) };
    const feed = await buildOpenActivityFeed([await signed(), await signed(second)], oracle, [account.address]);
    const proof = buildActivityMerkleProof(feed, 1);
    assert.equal(verifyActivityMerkleProof(feed[1]!.leaf, proof.siblings, proof.root), true);
    assert.equal(verifyActivityMerkleProof(feed[0]!.leaf, proof.siblings, proof.root), false);
  });

  it("exposes a CLI audit command for archived attestations", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    assert.equal(pkg.scripts["audit:attestations"], "node --import tsx scripts/audit-attestations.ts");
  });
});
