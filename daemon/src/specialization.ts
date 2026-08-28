export interface ProjectionPersonality {
  aggression: number;
  curiosity: number;
  sociability: number;
  greed: number;
  stability: number;
  chaos: number;
  adaptability: number;
  memoryBias: number;
}

export interface ProjectionNeeds {
  energy: number;
  mood: number;
  boredom: number;
  stress: number;
  socialNeed: number;
  arousal: number;
  stabilityState: number;
}

export interface SpecializationInput {
  level: number;
  personality: ProjectionPersonality;
  needs: ProjectionNeeds;
  activityCounters: readonly number[];
  relationshipSummary: {
    friends: number;
    rivals: number;
    averageAffinity: number;
    averageTrust: number;
  };
}

export type SpecializationId =
  | "contractnik"
  | "brodyaga"
  | "skryaga"
  | "suetolog"
  | "diplomat"
  | "parazit";

export interface SpecializationProjection {
  id: SpecializationId;
  label: string;
  score: number;
  active: boolean;
  reason: string;
}

const LABELS: Record<SpecializationId, string> = {
  contractnik: "Контрактник",
  brodyaga: "Бродяга",
  skryaga: "Скряга",
  suetolog: "Суетолог",
  diplomat: "Дипломат",
  parazit: "Паразит",
};

function clamp(value: number): number {
  return Math.max(0, Math.min(10_000, Math.trunc(value)));
}

function c(input: SpecializationInput, index: number): number {
  return Math.max(0, Math.min(1_000, Math.trunc(input.activityCounters[index] ?? 0)));
}

export function deriveSpecializations(input: SpecializationInput): SpecializationProjection[] {
  const p = input.personality;
  const n = input.needs;
  const r = input.relationshipSummary;
  const scores: Array<[SpecializationId, number, string]> = [
    [
      "contractnik",
      c(input, 2) * 70 + c(input, 9) * 45 + c(input, 4) * 20 + p.curiosity * 0.18,
      "любит контракты, selectors и повторные ABI-привычки",
    ],
    [
      "brodyaga",
      c(input, 6) * 90 + c(input, 3) * 70 + p.adaptability * 0.22 + p.curiosity * 0.12,
      "ходит к новым адресам и быстро привыкает к незнакомому",
    ],
    [
      "skryaga",
      p.greed * 0.58 + c(input, 1) * 30 + c(input, 4) * 20 - c(input, 0) * 8,
      "любит получать и возвращаться к знакомым местам",
    ],
    [
      "suetolog",
      p.chaos * 0.42 + n.arousal * 0.24 + c(input, 8) * 55 + c(input, 3) * 30,
      "суетится, жжёт газ и лезет в новое",
    ],
    [
      "diplomat",
      p.sociability * 0.44 + c(input, 7) * 80 + c(input, 6) * 25
        + Math.max(0, r.averageAffinity) * 0.2 + Math.max(0, r.averageTrust) * 0.2,
      "накапливает устойчивые контакты и доверие",
    ],
    [
      "parazit",
      c(input, 4) * 70 + p.greed * 0.28 + n.socialNeed * 0.16 + r.friends * 150,
      "цепляется за знакомые контракты и полезные связи",
    ],
  ];

  const activeThreshold = Math.max(4_500, 6_000 - Math.min(1_000, input.level * 40));
  return scores
    .map(([id, raw, reason]) => ({
      id,
      label: LABELS[id],
      score: clamp(raw),
      active: clamp(raw) >= activeThreshold,
      reason,
    }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
