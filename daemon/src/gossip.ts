import { keccak256, toHex, type Hex } from "viem";

export type SocialDisposition = "favor" | "grudge" | "neutral";

export interface CompactRelationship {
  affinity: number;
  trust: number;
  fear: number;
  respect: number;
  envy: number;
  rivalry: number;
}

export interface GossipEffect {
  affinity: number;
  trust: number;
  fear: number;
  respect: number;
  envy: number;
  rivalry: number;
}

export interface GossipInput {
  speakerTokenId: bigint;
  subjectTokenId: bigint;
  recipientTokenId: bigint;
  speakerToSubject: CompactRelationship;
  speakerToRecipient: CompactRelationship;
  recipientToSubject: CompactRelationship;
  memoryBias: number;
  seed: Hex;
}

export interface GossipOpinion {
  id: Hex;
  speakerTokenId: bigint;
  subjectTokenId: bigint;
  recipientTokenId: bigint;
  disposition: SocialDisposition;
  confidence: number;
  effect: GossipEffect;
  seed: Hex;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, Math.round(value)));
}

function signed(value: number): number {
  return clamp(value, -10_000, 10_000);
}

function stat(value: number): number {
  return clamp(value, 0, 10_000);
}

export function relationshipDisposition(relationship: CompactRelationship): SocialDisposition {
  const positive = relationship.affinity + relationship.trust + relationship.respect / 2;
  const negative = -relationship.affinity - relationship.trust / 2 + relationship.rivalry + relationship.envy / 2 + relationship.fear / 4;
  if (relationship.affinity <= -1_000 || relationship.rivalry >= 1_500 || negative >= 2_000) return "grudge";
  if (relationship.affinity >= 1_000 && relationship.trust >= 700) return "favor";
  if (positive >= 2_500 && positive > negative) return "favor";
  return "neutral";
}

export function buildGossipOpinion(input: GossipInput): GossipOpinion {
  if (input.speakerTokenId === input.subjectTokenId || input.speakerTokenId === input.recipientTokenId || input.subjectTokenId === input.recipientTokenId) {
    throw new Error("gossip participants must be distinct");
  }
  const disposition = relationshipDisposition(input.speakerToSubject);
  const memory = stat(input.memoryBias);
  const recipientTrust = stat(input.speakerToRecipient.trust);
  const recipientAffinity = stat(Math.max(0, input.speakerToRecipient.affinity));
  const jitter = Number(BigInt(input.seed) % 401n) - 200;
  const confidence = stat(1_000 + memory * 0.45 + recipientTrust * 0.35 + recipientAffinity * 0.1 + jitter);
  const scale = Math.max(25, Math.min(500, Math.round(confidence / 20)));
  const sign = disposition === "favor" ? 1 : disposition === "grudge" ? -1 : 0;
  const effect: GossipEffect = {
    affinity: sign * scale,
    trust: sign * Math.round(scale * 0.45),
    fear: disposition === "grudge" ? Math.round(scale * 0.2) : 0,
    respect: disposition === "favor" ? Math.round(scale * 0.2) : 0,
    envy: disposition === "grudge" ? Math.round(scale * 0.15) : 0,
    rivalry: disposition === "grudge" ? Math.round(scale * 0.55) : disposition === "favor" ? -Math.round(scale * 0.2) : 0,
  };
  const id = keccak256(toHex([
    "MERZAVTSY_GOSSIP_V1",
    input.speakerTokenId.toString(),
    input.subjectTokenId.toString(),
    input.recipientTokenId.toString(),
    disposition,
    confidence.toString(),
    input.seed.toLowerCase(),
  ].join(":")));
  return {
    id,
    speakerTokenId: input.speakerTokenId,
    subjectTokenId: input.subjectTokenId,
    recipientTokenId: input.recipientTokenId,
    disposition,
    confidence,
    effect,
    seed: input.seed,
  };
}

export function applyGossipEffect(base: CompactRelationship, effect: GossipEffect): CompactRelationship {
  return {
    affinity: signed(base.affinity + effect.affinity),
    trust: signed(base.trust + effect.trust),
    fear: stat(base.fear + effect.fear),
    respect: stat(base.respect + effect.respect),
    envy: stat(base.envy + effect.envy),
    rivalry: stat(base.rivalry + effect.rivalry),
  };
}

export function gossipEventPayload(opinion: GossipOpinion): Record<string, unknown> {
  return {
    kind: "GOSSIP_OPINION",
    id: opinion.id,
    speakerTokenId: opinion.speakerTokenId.toString(),
    subjectTokenId: opinion.subjectTokenId.toString(),
    recipientTokenId: opinion.recipientTokenId.toString(),
    disposition: opinion.disposition,
    confidence: opinion.confidence,
    effect: { ...opinion.effect },
    seed: opinion.seed,
  };
}
