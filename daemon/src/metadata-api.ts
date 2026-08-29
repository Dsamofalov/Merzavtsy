import { keccak256, toHex, type Hex } from "viem";
import type { CreatureMetadata } from "./metadata.js";

export interface GenomeBodyTraits {
  bodyShape: string;
  texture: string;
  eyes: string;
  accent: string;
}

const BODY_SHAPES = ["round", "crooked", "long", "squat", "spiky"] as const;
const TEXTURES = ["smooth", "mottled", "moldy", "scarred", "rough"] as const;
const EYES = ["beady", "sleepy", "wide", "calldata", "suspicious"] as const;
const ACCENTS = ["none", "ears", "whiskers", "gills", "teeth"] as const;

export function mapGenomeToBodyTraits(genomeSeed: Hex): GenomeBodyTraits {
  if (!/^0x[0-9a-fA-F]{64}$/.test(genomeSeed)) throw new Error("genome seed must be bytes32");
  const value = BigInt(genomeSeed);
  const pick = (shift: bigint, values: readonly string[]) => values[Number((value >> shift) % BigInt(values.length))]!;
  return {
    bodyShape: pick(0n, BODY_SHAPES),
    texture: pick(16n, TEXTURES),
    eyes: pick(32n, EYES),
    accent: pick(48n, ACCENTS),
  };
}

export function expressionForMood(mood: number, stress: number, arousal: number): string {
  if (stress >= 7_500 && arousal >= 6_500) return "feral";
  if (mood >= 7_500 && stress <= 2_500) return "smug";
  if (mood <= 2_500) return "miserable";
  if (arousal >= 7_500) return "wired";
  if (stress >= 6_000) return "tense";
  return "suspicious";
}

const ACCESSORIES: Record<string, readonly string[]> = {
  contractnik: ["abi_goggles", "calldata_pouch"],
  brodyaga: ["road_boots"],
  skryaga: ["coinless_purse"],
  suetolog: ["gas_meter_hat"],
  diplomat: ["crooked_tie"],
  parazit: ["sticky_backpack"],
};

export function specializationAccessories(ids: readonly string[]): string[] {
  const result: string[] = [];
  for (const id of ids) {
    for (const accessory of ACCESSORIES[id] ?? []) {
      if (!result.includes(accessory)) result.push(accessory);
    }
  }
  return result;
}

export interface MetadataApiResponse {
  status: 200;
  headers: {
    "content-type": "application/json; charset=utf-8";
    "cache-control": string;
    etag: string;
  };
  body: string;
}

export function buildMetadataApiResponse(metadata: CreatureMetadata): MetadataApiResponse {
  const body = JSON.stringify(metadata, (_key, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  const digest = keccak256(toHex(body));
  return {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60, stale-while-revalidate=300",
      etag: `"${digest}"`,
    },
    body,
  };
}