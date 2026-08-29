import {
  deriveSpecializations,
  type ProjectionNeeds,
  type ProjectionPersonality,
  type SpecializationProjection,
} from "./specialization.js";

export interface CreatureProfileInput {
  tokenId: bigint;
  ageSeconds: number;
  level: number;
  stage: number;
  personality: ProjectionPersonality;
  needs: ProjectionNeeds;
  activityCounters: readonly number[];
  mutationMask: bigint;
  scarMask: bigint;
  relationshipSummary: {
    friends: number;
    rivals: number;
    averageAffinity: number;
    averageTrust: number;
  };
  lastLifeIntent: number;
}

export interface CreatureProfile {
  tokenId: bigint;
  ageSeconds: number;
  level: number;
  stage: number;
  visiblePersonality: ProjectionPersonality;
  labels: string[];
  specializations: SpecializationProjection[];
  needs: ProjectionNeeds;
  mutationMask: bigint;
  scarMask: bigint;
  appearance: {
    maxTraitSlots: number;
    parts: string[];
    scars: string[];
  };
  lastActionExplanation: string;
}

const AXES: Array<keyof ProjectionPersonality> = [
  "aggression", "curiosity", "sociability", "greed",
  "stability", "chaos", "adaptability", "memoryBias",
];

function clamp(value: number): number {
  return Math.max(0, Math.min(10_000, Math.trunc(value)));
}

function bit(mask: bigint, index: number): boolean {
  return (mask & (1n << BigInt(index))) !== 0n;
}

function traitSlots(level: number): number {
  if (level >= 25) return 8;
  if (level >= 15) return 7;
  if (level >= 10) return 6;
  if (level >= 7) return 5;
  if (level >= 5) return 4;
  if (level >= 3) return 3;
  if (level >= 2) return 2;
  return 1;
}

export function projectVisiblePersonality(input: CreatureProfileInput): ProjectionPersonality {
  const result = { ...input.personality };
  const ageDays = Math.max(0, Math.min(3650, Math.trunc(input.ageSeconds / 86_400)));

  // Age does not rewrite the genome: it is a bounded presentation modifier.
  result.stability = clamp(result.stability + Math.min(700, ageDays * 4));
  result.memoryBias = clamp(result.memoryBias + Math.min(500, ageDays * 2));
  result.chaos = clamp(result.chaos - Math.min(400, ageDays));

  // Mutation bits are canonical biography; their modifiers are deterministic projection only.
  if (bit(input.mutationMask, 0)) result.adaptability = clamp(result.adaptability + 250); // Gas Gills
  if (bit(input.mutationMask, 1)) {
    result.curiosity = clamp(result.curiosity + 500); // Contract Teeth
    result.aggression = clamp(result.aggression + 150);
  }
  if (bit(input.mutationMask, 2)) {
    result.curiosity = clamp(result.curiosity + 600); // Calldata Eye
    result.adaptability = clamp(result.adaptability + 300);
  }
  if (bit(input.mutationMask, 4)) result.stability = clamp(result.stability - 350); // Wallet Mold
  if (bit(input.mutationMask, 8)) {
    result.greed = clamp(result.greed + 250); // Rusty Paw
    result.stability = clamp(result.stability - 150);
  }
  if (bit(input.mutationMask, 10)) result.memoryBias = clamp(result.memoryBias + 450); // Double Tongue

  for (const axis of AXES) result[axis] = clamp(result[axis]);
  return result;
}

function labelsFor(
  visible: ProjectionPersonality,
  specializations: SpecializationProjection[],
): string[] {
  const labels: string[] = [];
  if (visible.curiosity >= 7_500) labels.push("Любопытный");
  if (visible.memoryBias >= 7_000) labels.push("Злопамятный");
  if (visible.greed >= 7_000) labels.push("Скряга");
  if (visible.chaos >= 7_000) labels.push("Суетливый");
  if (visible.sociability >= 7_500) labels.push("Прилипчивый");
  if (visible.sociability <= 2_500) labels.push("Нелюдимый");
  if (visible.stability <= 2_500) labels.push("Истеричный");
  if (visible.stability >= 7_500) labels.push("Терпеливый");
  if (specializations.some((item) => item.id === "contractnik" && item.active)) {
    labels.push("Контрактный крысёныш");
  }
  if (labels.length === 0) labels.push("Обычный мерзавец");
  return [...new Set(labels)].slice(0, 6);
}

function appearanceFor(input: CreatureProfileInput) {
  const parts: string[] = [];
  if (bit(input.mutationMask, 0)) parts.push("gas_gills");
  if (bit(input.mutationMask, 1)) parts.push("contract_teeth");
  if (bit(input.mutationMask, 2)) parts.push("calldata_eye");
  if (bit(input.mutationMask, 3)) parts.push("pimpled_brain");
  if (bit(input.mutationMask, 4)) parts.push("wallet_mold");
  if (bit(input.mutationMask, 8)) parts.push("rusty_paw");
  if (bit(input.mutationMask, 9)) parts.push("network_scar");
  if (bit(input.mutationMask, 10)) parts.push("double_tongue");

  const scars: string[] = [];
  if (bit(input.scarMask, 0)) scars.push("first_deployment");
  if (bit(input.scarMask, 1)) scars.push("long_sleep");
  if (bit(input.scarMask, 2)) scars.push("first_mutation");
  if (bit(input.scarMask, 3)) scars.push("rivalry");
  if (bit(input.scarMask, 4)) scars.push("old_account");
  if (bit(input.scarMask, 5)) scars.push("rare_combo");

  return { maxTraitSlots: traitSlots(input.level), parts, scars };
}

function explainIntent(input: CreatureProfileInput): string {
  switch (input.lastLifeIntent) {
    case 0:
      return input.needs.energy < 3_000
        ? "Устал и решил спать: энергии почти не осталось."
        : "Решил отлежаться и стабилизировать состояние.";
    case 1:
      return input.needs.boredom > 6_000 || input.needs.arousal > 6_500
        ? "Пошёл бродить: скука или возбуждение потянули исследовать окружение."
        : "Пошёл бродить и искать новое занятие.";
    case 2:
      return "Ищет компанию: социальная потребность перевесила желание сидеть одному.";
    case 3:
      return "Полез издеваться над соперником: агрессия и возбуждение оказались достаточно высокими.";
    case 4:
      return "Занялся собой: настроение и стресс подсказали привести мерзавца в порядок.";
    case 5:
      return input.needs.stabilityState < 3_000 || input.needs.stress > 7_000
        ? "Спрятался: стресс вырос, а внутренняя стабильность просела."
        : "Решил спрятаться и не отсвечивать.";
    default:
      return "Последнее действие ещё не зафиксировано.";
  }
}

export function buildCreatureProfile(input: CreatureProfileInput): CreatureProfile {
  const visiblePersonality = projectVisiblePersonality(input);
  const specializationInput = { ...input, personality: visiblePersonality };
  const specializations = deriveSpecializations(specializationInput);
  return {
    tokenId: input.tokenId,
    ageSeconds: input.ageSeconds,
    level: input.level,
    stage: input.stage,
    visiblePersonality,
    labels: labelsFor(visiblePersonality, specializations),
    specializations,
    needs: { ...input.needs },
    mutationMask: input.mutationMask,
    scarMask: input.scarMask,
    appearance: appearanceFor(input),
    lastActionExplanation: explainIntent(input),
  };
}
