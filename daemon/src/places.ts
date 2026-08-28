import type { Address } from "viem";

export type ProtocolPlaceKind = "market" | "port" | "gallery" | "den" | "unknown";

export interface ProtocolPlaceDefinition {
  address: Address;
  tags: string[];
}

export interface PlaceVisit {
  tokenId: bigint;
  address: Address;
  blockNumber: bigint;
  timestamp: bigint;
}

export interface FamiliarPlace {
  address: Address;
  kind: ProtocolPlaceKind;
  visits: number;
  familiarity: number;
  firstSeenAt: bigint;
  lastSeenAt: bigint;
}

export interface CoOccurrenceMeeting {
  a: bigint;
  b: bigint;
  address: Address;
  count: number;
}

const PLACE_KINDS: ProtocolPlaceKind[] = ["market", "port", "gallery", "den", "unknown"];

function clampStat(value: number): number {
  return Math.max(0, Math.min(10_000, Math.round(value)));
}

function normalizedTags(tags: readonly string[]): string[] {
  return tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
}

export function classifyProtocolPlace(tags: readonly string[]): ProtocolPlaceKind {
  const values = normalizedTags(tags);
  const contains = (...needles: string[]) => values.some((tag) => needles.some((needle) => tag.includes(needle)));
  if (contains("dex", "swap", "amm")) return "market";
  if (contains("bridge")) return "port";
  if (contains("nft", "erc721", "erc1155", "marketplace")) return "gallery";
  if (contains("game", "gaming")) return "den";
  return "unknown";
}

function catalogKinds(catalog: readonly ProtocolPlaceDefinition[]): Map<string, ProtocolPlaceKind> {
  const result = new Map<string, ProtocolPlaceKind>();
  for (const item of catalog) result.set(item.address.toLowerCase(), classifyProtocolPlace(item.tags));
  return result;
}

export function familiarPlaces(
  visits: readonly PlaceVisit[],
  tokenId: bigint,
  catalog: readonly ProtocolPlaceDefinition[],
  minimumVisits = 2,
): FamiliarPlace[] {
  if (!Number.isInteger(minimumVisits) || minimumVisits < 1) throw new Error("minimumVisits must be a positive integer");
  const kinds = catalogKinds(catalog);
  const grouped = new Map<string, PlaceVisit[]>();
  for (const item of visits) {
    if (item.tokenId !== tokenId) continue;
    const key = item.address.toLowerCase();
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }

  return [...grouped.values()]
    .filter((items) => items.length >= minimumVisits)
    .map((items) => {
      const ordered = [...items].sort((a, b) => a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0);
      const address = ordered[0]!.address;
      return {
        address,
        kind: kinds.get(address.toLowerCase()) ?? "unknown",
        visits: ordered.length,
        familiarity: clampStat(ordered.length * 2_500),
        firstSeenAt: ordered[0]!.timestamp,
        lastSeenAt: ordered.at(-1)!.timestamp,
      };
    })
    .sort((a, b) => b.visits - a.visits || a.address.toLowerCase().localeCompare(b.address.toLowerCase()));
}

export function territoryAffinity(
  visits: readonly PlaceVisit[],
  tokenId: bigint,
  catalog: readonly ProtocolPlaceDefinition[],
): Record<ProtocolPlaceKind, number> {
  const kinds = catalogKinds(catalog);
  const counts: Record<ProtocolPlaceKind, number> = { market: 0, port: 0, gallery: 0, den: 0, unknown: 0 };
  let total = 0;
  for (const item of visits) {
    if (item.tokenId !== tokenId) continue;
    const kind = kinds.get(item.address.toLowerCase()) ?? "unknown";
    counts[kind] += 1;
    total += 1;
  }
  if (total === 0) return counts;
  for (const kind of PLACE_KINDS) counts[kind] = clampStat((counts[kind] / total) * 10_000);
  return counts;
}

export function coOccurrenceMeetings(
  visits: readonly PlaceVisit[],
  bucketSeconds: bigint,
): CoOccurrenceMeeting[] {
  if (bucketSeconds <= 0n) throw new Error("bucketSeconds must be positive");
  const buckets = new Map<string, { address: Address; tokens: Set<bigint> }>();
  for (const item of visits) {
    if (item.timestamp < 0n) throw new Error("visit timestamp must be non-negative");
    const bucket = item.timestamp / bucketSeconds;
    const key = `${item.address.toLowerCase()}:${bucket}`;
    const entry = buckets.get(key) ?? { address: item.address, tokens: new Set<bigint>() };
    entry.tokens.add(item.tokenId);
    buckets.set(key, entry);
  }

  const pairs = new Map<string, CoOccurrenceMeeting>();
  for (const entry of buckets.values()) {
    const tokens = [...entry.tokens].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    for (let i = 0; i < tokens.length; i += 1) {
      for (let j = i + 1; j < tokens.length; j += 1) {
        const a = tokens[i]!;
        const b = tokens[j]!;
        const key = `${a}:${b}:${entry.address.toLowerCase()}`;
        const current = pairs.get(key);
        if (current === undefined) pairs.set(key, { a, b, address: entry.address, count: 1 });
        else current.count += 1;
      }
    }
  }

  return [...pairs.values()].sort((left, right) =>
    left.a < right.a ? -1 : left.a > right.a ? 1
      : left.b < right.b ? -1 : left.b > right.b ? 1
        : left.address.toLowerCase().localeCompare(right.address.toLowerCase())
  );
}
