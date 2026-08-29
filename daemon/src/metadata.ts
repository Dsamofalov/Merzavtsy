import type { CreatureProfile } from "./profile.js";

export interface MetadataAttribute {
  trait_type: string;
  value: string | number;
}

export interface CreatureMetadata {
  name: string;
  description: string;
  image: string;
  attributes: MetadataAttribute[];
}

const STAGES = ["Зародыш", "Пакостник", "Мерзавец", "Матёрый", "Архимерзавец"] as const;

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function topSpecialization(profile: CreatureProfile): string {
  return profile.specializations.find((item) => item.active)?.label
    ?? profile.specializations[0]?.label
    ?? "Без специализации";
}

function renderSvg(profile: CreatureProfile): string {
  const labels = profile.labels.slice(0, 3).join(" · ");
  const parts = profile.appearance.parts.slice(0, profile.appearance.maxTraitSlots).join(", ") || "без заметных мутаций";
  const stage = STAGES[profile.stage] ?? `Стадия ${profile.stage}`;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720">',
    '<rect width="720" height="720" rx="48" fill="#171717"/>',
    '<circle cx="360" cy="295" r="150" fill="#d7d7c9"/>',
    '<circle cx="310" cy="270" r="18" fill="#171717"/><circle cx="410" cy="270" r="18" fill="#171717"/>',
    '<path d="M300 360 Q360 400 420 350" fill="none" stroke="#171717" stroke-width="16" stroke-linecap="round"/>',
    `<text x="48" y="70" fill="white" font-size="38" font-family="monospace">${xml(`Мерзавец #${profile.tokenId}`)}</text>`,
    `<text x="48" y="500" fill="white" font-size="27" font-family="monospace">${xml(stage)}</text>`,
    `<text x="48" y="545" fill="#d7d7c9" font-size="22" font-family="monospace">${xml(labels)}</text>`,
    `<text x="48" y="585" fill="#d7d7c9" font-size="19" font-family="monospace">${xml(topSpecialization(profile))}</text>`,
    `<text x="48" y="625" fill="#aaa" font-size="16" font-family="monospace">${xml(parts)}</text>`,
    `<text x="48" y="665" fill="#777" font-size="14" font-family="monospace">level ${profile.level} · traits ${profile.appearance.maxTraitSlots}</text>`,
    "</svg>",
  ].join("");
}

export function buildMetadata(profile: CreatureProfile): CreatureMetadata {
  const stage = STAGES[profile.stage] ?? `Стадия ${profile.stage}`;
  const specialization = topSpecialization(profile);
  const svg = renderSvg(profile);
  const attributes: MetadataAttribute[] = [
    { trait_type: "Стадия", value: stage },
    { trait_type: "Уровень", value: profile.level },
    { trait_type: "Специализация", value: specialization },
    { trait_type: "Метки", value: profile.labels.join(", ") },
    { trait_type: "Мутации", value: profile.appearance.parts.join(", ") || "нет" },
    { trait_type: "Шрамы", value: profile.appearance.scars.join(", ") || "нет" },
    { trait_type: "Энергия", value: profile.needs.energy },
    { trait_type: "Настроение", value: profile.needs.mood },
    { trait_type: "Возбуждение", value: profile.needs.arousal },
    { trait_type: "Стабильность состояния", value: profile.needs.stabilityState },
  ];
  return {
    name: `Мерзавец #${profile.tokenId}`,
    description: `${stage}. ${profile.labels.join(", ")}. ${profile.lastActionExplanation}`,
    image: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    attributes,
  };
}
