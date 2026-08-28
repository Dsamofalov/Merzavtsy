import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { Address, Hex } from "viem";
import { aggregateEpoch } from "../src/aggregator.js";
import { ActivityHistoryStore } from "../src/activity-history.js";
import { buildMetadataApiResponse, expressionForMood, mapGenomeToBodyTraits, specializationAccessories } from "../src/metadata-api.js";
import { renderBiographyComedy, renderDialogue, renderTimeline, searchHistory, summarizeHistory } from "../src/narrative.js";
import { scanRepositorySecrets } from "../src/secret-scan.js";
import { rotateOracleSigner } from "../src/signer-rotation.js";
import { ActivityCategory, type ClassifiedActivity } from "../src/types.js";

const wallet = "0x1111111111111111111111111111111111111111" as Address;
const peerWallet = "0x2222222222222222222222222222222222222222" as Address;
const contract = "0x3333333333333333333333333333333333333333" as Address;
const tx = (byte: number) => `0x${byte.toString(16).padStart(2, "0").repeat(32)}` as Hex;

function activity(
  category: ActivityCategory,
  blockNumber: bigint,
  txHash: Hex,
  extras: Partial<ClassifiedActivity> = {},
): ClassifiedActivity {
  return { category, units: 1, blockNumber, txHash, ...extras };
}

describe("persistent activity history and anti-spam", () => {
  it("persists cadence, inactivity and repeated-protocol co-occurrence across restart", () => {
    const path = join(mkdtempSync(join(tmpdir(), "merzavtsy-history-")), "history.sqlite");
    try {
      {
        const store = new ActivityHistoryStore(path);
        store.record(wallet, [
          activity(ActivityCategory.CONTRACT_CALL, 100n, tx(1), { contract }),
          activity(ActivityCategory.CONTRACT_CALL, 100n, tx(2), { contract }),
          activity(ActivityCategory.CONTRACT_CALL, 100n, tx(3), { contract }),
          activity(ActivityCategory.CONTRACT_CALL, 120n, tx(4), { contract }),
        ]);
        const snapshot = store.snapshot(wallet, 130n);
        assert.ok(snapshot.cadenceBurstCount >= 1);
        assert.ok(snapshot.repeatedProtocolCount >= 1);
        assert.equal(snapshot.inactivityBlocks, 10n);
        store.close();
      }
      {
        const reopened = new ActivityHistoryStore(path);
        const snapshot = reopened.snapshot(wallet, 150n);
        assert.ok(snapshot.cadenceBurstCount >= 1);
        assert.ok(snapshot.repeatedProtocolCount >= 1);
        assert.equal(snapshot.inactivityBlocks, 30n);
        reopened.close();
      }
    } finally {
      rmSync(path.replace(/\/history\.sqlite$/, ""), { recursive: true, force: true });
    }
  });

  it("uses long-history cadence as an anti-spam penalty and saturates repeated peer pairs", () => {
    const activities: ClassifiedActivity[] = [];
    for (let i = 0; i < 20; i += 1) {
      activities.push(activity(ActivityCategory.CONTRACT_CALL, 100n + BigInt(i), tx(10 + i), { contract }));
    }
    for (let i = 0; i < 40; i += 1) {
      activities.push(activity(ActivityCategory.REGISTERED_PEER_CONTACT, 200n + BigInt(i), tx(40 + i), { peerTokenId: 2n }));
    }
    const normal = aggregateEpoch(wallet, 1n, 1n, 100n, 300n, activities);
    const penalized = aggregateEpoch(wallet, 1n, 1n, 100n, 300n, activities, {
      cadenceBurstCount: 100,
      repeatedProtocolCount: 100,
      inactivityBlocks: 0n,
    });
    assert.ok(penalized.xpDelta < normal.xpDelta);
    assert.ok(penalized.categoryCounters[ActivityCategory.REGISTERED_PEER_CONTACT] <= 20);
  });
});

describe("history, narrative and metadata shell", () => {
  const events = [
    { id: "1", blockNumber: 10n, timestamp: 1000n, type: "birth", title: "Рождение", detail: "Появился на свет", tokenId: 1n },
    { id: "2", blockNumber: 20n, timestamp: 2000n, type: "mutation", title: "Мутация", detail: "Отрастил Contract Teeth", tokenId: 1n },
    { id: "3", blockNumber: 30n, timestamp: 3000n, type: "relationship", title: "Ссора", detail: "Посрался с соседом", tokenId: 1n, peerTokenId: 2n },
  ] as const;

  it("renders a stable long-form timeline, searchable history and analytics", () => {
    const timeline = renderTimeline(events);
    assert.match(timeline, /Рождение/);
    assert.match(timeline, /Contract Teeth/);
    assert.equal(searchHistory(events, "соседом").length, 1);
    const analytics = summarizeHistory(events);
    assert.equal(analytics.totalEvents, 3);
    assert.equal(analytics.byType.mutation, 1);
    assert.equal(analytics.firstBlock, 10n);
    assert.equal(analytics.lastBlock, 30n);
  });

  it("renders deterministic consumer narrative/dialogue with the approved dirty-affectionate tone", () => {
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
    const oldSigner = "0x4444444444444444444444444444444444444444" as Address;
    const nextSigner = "0x5555555555555555555555555555555555555555" as Address;
    const calls: string[] = [];
    let granted = false;
    let oldGranted = true;
    await rotateOracleSigner(oldSigner, nextSigner, {
      async hasRole(address) { return address === nextSigner ? granted : oldGranted; },
      async grant(address) { assert.equal(address, nextSigner); calls.push("grant"); granted = true; },
      async revoke(address) { assert.equal(address, oldSigner); assert.equal(granted, true); calls.push("revoke"); oldGranted = false; },
    });
    assert.deepEqual(calls, ["grant", "revoke"]);
  });
});
