import type { Hex } from "viem";
import type { IndexedEvent } from "./store.js";

const MEMORY_TEXT: Record<number, string> = {
  0: "встретил другого мерзавца и запомнил эту рожу",
  1: "помог знакомому мерзавцу и теперь имеет право припоминать добро",
  2: "высмеял знакомого и аккуратно положил пакость в биографию",
  3: "предал бывшего приятеля — такое уже не отмоешь",
  4: "дотащил отношения до настоящей дружбы",
  5: "дотащил отношения до полноценного соперничества",
};

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  return null;
}

export function renderEventDescription(event: IndexedEvent): string {
  if (event.eventName === "MemoryRecorded") {
    const kind = numeric(event.payload.kind) ?? -1;
    return `На блоке ${event.blockNumber} мерзавец ${MEMORY_TEXT[kind] ?? "запомнил важную странность"}.`;
  }
  if (event.eventName === "MutationsUnlocked") {
    return `На блоке ${event.blockNumber} биография проросла новой необратимой мутацией.`;
  }
  if (event.eventName === "Scarred") {
    return `На блоке ${event.blockNumber} появилась новая зарубка, которую уже не сотрёшь.`;
  }
  if (event.eventName === "Hibernated") {
    return `На блоке ${event.blockNumber} мерзавец залёг в спячку и перестал отсвечивать.`;
  }
  if (event.eventName === "Awakened") {
    return `На блоке ${event.blockNumber} мерзавец проснулся и снова полез в Ethereum.`;
  }
  if (event.eventName === "StageAdvanced") {
    return `На блоке ${event.blockNumber} мерзавец дорос до следующей жизненной стадии.`;
  }
  if (event.eventName === "LifeAction") {
    const intent = numeric(event.payload.intent);
    return `На блоке ${event.blockNumber} автономная зараза выбрала действие ${intent ?? "?"}.`;
  }
  return `На блоке ${event.blockNumber} зафиксировано событие ${event.eventName}.`;
}

export interface BiographyComedyInput {
  tokenId: bigint;
  labels: readonly string[];
  stage: string;
  mutationNames: readonly string[];
  scarNames: readonly string[];
}

export function renderBiographyComedy(
  profile: BiographyComedyInput,
  events: readonly IndexedEvent[],
): string {
  const labels = profile.labels.slice(0, 3).join(", ") || "без внятного характера";
  const mutation = profile.mutationNames[0] ?? "ни одной приличной мутации";
  const scar = profile.scarNames[0] ?? "пока без памятных шрамов";
  const episodes = events.length;
  return `Мерзавец #${profile.tokenId} — ${profile.stage}: ${labels}. Эта пакость уже пережила ${episodes} заметных эпизода, обзавелась штукой «${mutation}» и носит в биографии «${scar}». Гад не герой и не инвестиция: просто упрямая Ethereum-зараза, которая превращает привычки адреса в характер и потом ещё имеет наглость это помнить.`;
}

export interface DialogueInput {
  actorTokenId: bigint;
  targetTokenId: bigint;
  intent: string;
  mood: number;
  memoryBias: number;
  seed: Hex;
}

function seedIndex(seed: Hex, length: number): number {
  const tail = seed.slice(-8);
  return Number.parseInt(tail, 16) % length;
}

export function renderDialogue(input: DialogueInput): string {
  const hostile = [
    `Ты снова припёрся, #${input.targetTokenId}. Я тебя помню слишком хорошо.`,
    `Эй, #${input.targetTokenId}, тебя Ethereum опять сюда занёс? Какая настойчивая беда.`,
    `Я бы тебя забыл, #${input.targetTokenId}, но память у меня злопамятная. Так что получай насмешку.`,
  ];
  const social = [
    `Ну здравствуй, #${input.targetTokenId}. Не делай вид, что ты здесь случайно.`,
    `Опять ты, #${input.targetTokenId}. Ладно, подходи, пока настроение не испортилось.`,
  ];
  const quiet = [
    `Сегодня я никого не трогаю. Это подозрительно, но временно.`,
    `Сижу тихо и коплю силы на следующую пакость.`,
  ];
  const pool = input.intent === "MOCK_RIVAL" ? hostile : input.targetTokenId !== 0n ? social : quiet;
  const memoryOffset = input.memoryBias >= 7_000 ? 1 : 0;
  return pool[(seedIndex(input.seed, pool.length) + memoryOffset) % pool.length]!;
}
