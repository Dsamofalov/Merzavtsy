import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCreatureProfile, projectVisiblePersonality } from "../src/profile.js";
import { deriveSpecializations } from "../src/specialization.js";
import { buildMetadata } from "../src/metadata.js";

const base = {
  tokenId: 77n,
  ageSeconds: 120 * 24 * 60 * 60,
  level: 18,
  stage: 3,
  personality: {
    aggression: 6200,
    curiosity: 9000,
    sociability: 7200,
    greed: 6800,
    stability: 4000,
    chaos: 7600,
    adaptability: 8200,
    memoryBias: 7000,
  },
  needs: {
    energy: 6000,
    mood: 5500,
    boredom: 3000,
    stress: 4200,
    socialNeed: 6500,
    arousal: 7300,
    stabilityState: 4300,
  },
  activityCounters: [20, 8, 80, 30, 45, 4, 35, 16, 12, 50] as const,
  mutationMask: (1n << 1n) | (1n << 2n) | (1n << 8n),
  scarMask: (1n << 0n) | (1n << 2n),
  relationshipSummary: { friends: 3, rivals: 2, averageAffinity: 1100, averageTrust: 900 },
  lastLifeIntent: 1,
} as const;

describe("visible creature profile", () => {
  it("applies bounded age and permanent-mutation modifiers without mutating canonical axes", () => {
    const canonical = { ...base.personality };
    const visible = projectVisiblePersonality(base);
    assert.deepEqual(base.personality, canonical);
    assert.notDeepEqual(visible, canonical);
    for (const value of Object.values(visible)) assert.ok(value >= 0 && value <= 10_000);

    const young = projectVisiblePersonality({ ...base, ageSeconds: 3600, mutationMask: 0n });
    assert.notDeepEqual(visible, young, "age and mutations must be visible modifiers");
  });

  it("derives all six approved specialization scores and supports hybrids", () => {
    const specs = deriveSpecializations(base);
    assert.deepEqual(
      new Set(specs.map((item) => item.id)),
      new Set(["contractnik", "brodyaga", "skryaga", "suetolog", "diplomat", "parazit"]),
    );
    assert.ok(specs.every((item) => item.score >= 0 && item.score <= 10_000));
    assert.ok(specs.filter((item) => item.active).length >= 2, "strong mixed history should create a hybrid");
    assert.equal(specs[0].score >= specs[1].score, true, "results are ranked deterministically");
  });

  it("projects Russian labels, level-gated appearance slots, specializations and a legible intent explanation", () => {
    const profile = buildCreatureProfile(base);
    assert.ok(profile.labels.length >= 2);
    assert.ok(profile.labels.some((label) => /Любопыт|Контракт|Сует|Злопамят/.test(label)));
    assert.equal(profile.appearance.maxTraitSlots >= 6, true);
    assert.ok(profile.appearance.parts.includes("contract_teeth"));
    assert.ok(profile.appearance.parts.includes("calldata_eye"));
    assert.ok(profile.specializations.some((spec) => spec.active));
    assert.match(profile.lastActionExplanation, /брод|скуч|возбуж|исслед/i);
  });

  it("builds deterministic self-contained metadata + escaped SVG without network dependencies", () => {
    const profile = buildCreatureProfile(base);
    const first = buildMetadata(profile);
    const second = buildMetadata(profile);
    assert.deepEqual(first, second);
    assert.equal(first.name, "Мерзавец #77");
    assert.match(first.image, /^data:image\/svg\+xml/);
    assert.ok(first.attributes.some((item) => item.trait_type === "Стадия"));
    assert.ok(first.attributes.some((item) => item.trait_type === "Специализация"));
    const decoded = decodeURIComponent(first.image.split(",", 2)[1]);
    assert.match(decoded, /<svg/);
    assert.doesNotMatch(decoded, /<script|https?:\/\//i);
  });
});
