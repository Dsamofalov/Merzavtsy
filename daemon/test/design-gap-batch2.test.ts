import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { Address, Hex } from "viem";
import { DaemonStore, type IndexedEvent } from "../src/store.js";
import "../src/store-operational.js";
import {
  activityHistoryMetrics,
  recordActivityObservation,
  type ActivityHistoryMetrics,
} from "../src/activity-history.js";
import {
  analyzeHistory,
  renderTimeline,
  searchHistory,
} from "../src/history.js";
import {
  renderBiographyComedy,
  renderDialogue,
  renderEventDescription,
} from "../src/narrative.js";
import {
  buildMetadataApiResponse,
  expressionForMood,
  mapGenomeToBodyTraits,
  specializationAccessories,
} from "../src/metadata-api.js";
import { scanRepositorySecrets } from "../src/secret-scan.js";
import { rotateOracleSigner, type SignerRotationDriver } from "../src/signer-rotation.js";
import { aggregateEpoch } from "../src/aggregator.js";
import { ActivityCategory, type ClassifiedActivity } from "../src/types.js";

const wallet = "0x1111111111111111111111111111111111111111" as Address;
const contractA = "0x2222222222222222222222222222222222222222" as Address;
const contractB = "0x3333333333333333333333333333333333333333" as Address;
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;

describe("persistent activity history and anti-spam", () => {
  it("persists cadence, inactivity and repeated-protocol co-occurrence across restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "merzavtsy-history-"));
    const path = join(dir, "daemon.sqlite");
    try {
      let store = new DaemonStore(path);
      recordActivityObservation(store, { wallet, txHash: tx(1), blockNumber: 10n, timestamp: 1_000n, contract: contractA });
      recordActivityObservation(store, { wallet, txHash: tx(2), blockNumber: 11n, timestamp: 1_060n, contract: contractA });
      recordActivityObservation(store, { wallet, txHash: tx(3), blockNumber: 30n, timestamp: 5_000n, contract: contractB });
      store.close();

      store = new DaemonStore(path);
      const metrics = activityHistoryMetrics(store, wallet, 8_600n);
      assert.equal(metrics.transactionCount, 3);
      assert.equal(metrics.burstCount, 1);
      assert.equal(metrics.inactivitySeconds, 3_600n);
      assert.equal(metrics.repeatedProtocolContracts, 1);
      assert.ok(metrics.averageGapSeconds > 0n);
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses long-history cadence as an anti-spam penalty and saturates repeated peer pairs", () => {
    const activities: ClassifiedActivity[] = Array.from({ length: 12 }, (_, index) => ({
      category: ActivityCategory.REGISTERED_PEER_CONTACT,
      units: 1,
      blockNumber: BigInt(100 + index),
      txHash: tx(100 + index),
      peerTokenId: 9n,
    }));
    const clean: ActivityHistoryMetrics = {
      transactionCount: 5,
      burstCount: 0,
      inactivitySeconds: 0n,
      averageGapSeconds: 1200n,
      repeatedProtocolContracts: 0,
    };
    const spammy: ActivityHistoryMetrics = { ...clean, transactionCount: 200, burstCount: 80, averageGapSeconds: 5n };
    const normal = aggregateEpoch(wallet, 1n, 1n, 100n, 120n, activities, clean);
    const penalized = aggregateEpoch(wallet, 1n, 1n, 100n, 120n, activities, spammy);
    assert.ok(penalized.xpDelta < normal.xpDelta);
    assert.ok(normal.categoryCounters[ActivityCategory.REGISTERED_PEER_CONTACT] <= 3, "same pair saturates per epoch");
  });
});

describe("history, narrative and metadata shell", () => {
  const events: IndexedEvent[] = [
    { txHash: tx(10), logIndex: 0, blockNumber: 10n, address: contractA, eventName: "MemoryRecorded", payload: { actorTokenId: "1", targetTokenId: "2", kind: 1 } },
    { txHash: tx(11), logIndex: 0, blockNumber: 12n, address: contractA, eventName: "MutationsUnlocked", payload: { tokenId: "1", newBits: "2" } },
    { txHash: tx(12), logIndex: 1, blockNumber: 13n, address: contractA, eventName: "LifeAction", payload: { tokenId: "1", intent: 3 } },
  ];

  it("renders a stable long-form timeline, searchable history and analytics", () => {
    const timeline = renderTimeline(events);
    assert.equal(timeline.length, 3);
    assert.match(timeline[0]!.text, /помог|встрет|памят/i);
    assert.equal(searchHistory(events, "mutation").length, 1);
    assert.equal(searchHistory(events, "token:1").length, 3);
    const analytics = analyzeHistory(events);
    assert.equal(analytics.totalEvents, 3);
    assert.equal(analytics.eventCounts.LifeAction, 1);
    assert.equal(analytics.firstBlock, 10n);
    assert.equal(analytics.lastBlock, 13n);
  });

  it("renders deterministic consumer narrative/dialogue with the approved dirty-affectionate tone", () => {
    const description = renderEventDescription(events[0]!);
    assert.ok(description.length > 20);
    const comedy = renderBiographyComedy({ tokenId: 1n, labels: ["Любопытный", "Злопамятный"], stage: "Мерзавец", mutationNames: ["Contract Teeth"], scarNames: ["первая драка"] }, events);
    const dialogue = renderDialogue({ actorTokenId: 1n, targetTokenId: 2n, intent: "MOCK_RIVAL", mood: 4200, memoryBias: 8000, seed: tx(77) });
    assert.match(comedy, /мерзав|зараза|пакост|гад|дрян/i);
    assert.match(dialogue, /ты|тебя|снова|припёр/i);
    assert.ok(comedy.length < 800 && dialogue.length < 300);
    assert.doesNotMatch(`${comedy} ${dialogue}`, /yield|profit|доход|казино|ставк/i);
    assert.equal(renderDialogue({ actorTokenId: 1n, targetTokenId: 2n, intent: "MOCK_RIVAL", mood: 4200, memoryBias: 8000, seed: tx(77) }), dialogue);
  });

  it("maps genome, mood and specialization into deterministic metadata traits and API response", () => {
    const genome = mapGenomeToBodyTraits(tx(999));
    assert.ok(genome.bodyShape.length > 0 && genome.texture.length > 0 && genome.eyes.length > 0);
    assert.equal(expressionForMood(9000, 500, 3000), "smug");
    assert.equal(expressionForMood(2000, 8500, 8000), "feral");
    assert.ok(specializationAccessories(["contractnik", "diplomat"]).includes("abi_goggles"));
    const response = buildMetadataApiResponse({
      tokenId: 7n,
      name: "Мерзавец #7",
      description: "Проверочная биография",
      image: "data:image/svg+xml,%3Csvg%2F%3E",
      attributes: [{ trait_type: "Mood", value: 9000 }],
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers["content-type"], "application/json; charset=utf-8");
    assert.match(response.headers.etag, /^"0x[0-9a-f]{64}"$/);
    assert.equal(JSON.parse(response.body).name, "Мерзавец #7");
  });
});

describe("release security and signer rotation", () => {
  it("detects secret-shaped tracked source while allowing placeholders", () => {
    const dir = mkdtempSync(join(tmpdir(), "merzavtsy-secret-scan-"));
    try {
      writeFileSync(join(dir, ".env.example"), "ORACLE_PRIVATE_KEY=0xYOUR_ORACLE_PRIVATE_KEY\n");
      writeFileSync(join(dir, "safe.ts"), "export const label = 'hello';\n");
      assert.deepEqual(scanRepositorySecrets(dir), []);
      writeFileSync(join(dir, "leak.env"), `ORACLE_PRIVATE_KEY=0x${"ab".repeat(32)}\n`);
      const findings = scanRepositorySecrets(dir);
      assert.equal(findings.length, 1);
      assert.match(findings[0]!.path, /leak\.env$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rotates signer grant-before-revoke and verifies both postconditions", async () => {
    const calls: string[] = [];
    const oldSigner = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
    const nextSigner = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
    const driver: SignerRotationDriver = {
      async hasSigner(address) { return address.toLowerCase() === oldSigner || calls.includes(`grant:${address}`); },
      async grantSigner(address) { calls.push(`grant:${address}`); },
      async revokeSigner(address) { calls.push(`revoke:${address}`); },
      async hasSignerAfter(address) { return address.toLowerCase() === nextSigner.toLowerCase(); },
    };
    await rotateOracleSigner(driver, oldSigner, nextSigner);
    assert.deepEqual(calls, [`grant:${nextSigner}`, `revoke:${oldSigner}`]);
  });
});
