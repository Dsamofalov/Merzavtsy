import { keccak256, toHex, type Hex } from "viem";
import type { ProtocolPlaceKind } from "./places.js";

export interface SocialEdge {
  a: bigint;
  b: bigint;
  weight: number;
  affinity: number;
}

export interface PackMemberSignal {
  tokenId: bigint;
  reputation: number;
  territory: Partial<Record<ProtocolPlaceKind, number>>;
}

export interface EmergentPack {
  id: Hex;
  name: string;
  members: bigint[];
  reputation: number;
  territory: ProtocolPlaceKind;
  territoryAffinity: number;
  cohesion: number;
}

export interface PackRelation {
  aPackId: Hex;
  bPackId: Hex;
  affinity: number;
  rivalry: number;
  evidenceWeight: number;
}

export interface PackMigrationSuggestion {
  tokenId: bigint;
  fromPackId: Hex;
  toPackId: Hex;
  internalWeight: number;
  externalWeight: number;
}

const TERRITORY_ORDER: ProtocolPlaceKind[] = ["market", "port", "gallery", "den", "unknown"];

function clamp(value: number, low = 0, high = 10_000): number {
  return Math.max(low, Math.min(high, Math.round(value)));
}

function sortedPair(a: bigint, b: bigint): [bigint, bigint] {
  return a <= b ? [a, b] : [b, a];
}

function packName(territory: ProtocolPlaceKind, members: readonly bigint[]): string {
  const prefix: Record<ProtocolPlaceKind, string> = {
    market: "Рыночная шайка",
    port: "Портовые паскуды",
    gallery: "Галерейные крысы",
    den: "Берложная свора",
    unknown: "Бродячая шайка",
  };
  const suffix = keccak256(toHex(members.map(String).join(","))).slice(2, 8);
  return `${prefix[territory]} ${suffix}`;
}

function componentId(members: readonly bigint[]): Hex {
  return keccak256(toHex(`MERZAVTSY_PACK_V1:${members.map(String).join(",")}`));
}

function memberMap(members: readonly PackMemberSignal[]): Map<bigint, PackMemberSignal> {
  return new Map(members.map((item) => [item.tokenId, item]));
}

export function discoverPacks(
  edges: readonly SocialEdge[],
  members: readonly PackMemberSignal[],
  minimumEdgeWeight = 5,
): EmergentPack[] {
  if (!Number.isFinite(minimumEdgeWeight) || minimumEdgeWeight < 0) throw new Error("minimumEdgeWeight must be non-negative");
  const adjacency = new Map<bigint, Set<bigint>>();
  for (const member of members) adjacency.set(member.tokenId, new Set());
  for (const item of edges) {
    if (item.a === item.b || item.weight < minimumEdgeWeight) continue;
    if (!adjacency.has(item.a) || !adjacency.has(item.b)) continue;
    adjacency.get(item.a)!.add(item.b);
    adjacency.get(item.b)!.add(item.a);
  }

  const signals = memberMap(members);
  const visited = new Set<bigint>();
  const components: bigint[][] = [];
  for (const tokenId of [...adjacency.keys()].sort((a, b) => a < b ? -1 : a > b ? 1 : 0)) {
    if (visited.has(tokenId)) continue;
    const stack = [tokenId];
    const component: bigint[] = [];
    visited.add(tokenId);
    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      for (const next of adjacency.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }
    component.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    if (component.length >= 2) components.push(component);
  }

  return components.map((component) => {
    const componentSet = new Set(component);
    const componentSignals = component.map((tokenId) => signals.get(tokenId)!).filter(Boolean);
    const reputation = clamp(componentSignals.reduce((sum, item) => sum + clamp(item.reputation), 0) / componentSignals.length);
    const territoryTotals: Record<ProtocolPlaceKind, number> = { market: 0, port: 0, gallery: 0, den: 0, unknown: 0 };
    for (const signal of componentSignals) {
      for (const kind of TERRITORY_ORDER) territoryTotals[kind] += clamp(signal.territory[kind] ?? 0);
    }
    const territory = TERRITORY_ORDER.reduce((best, kind) =>
      territoryTotals[kind] > territoryTotals[best] ? kind : best,
    TERRITORY_ORDER[0]!);
    const territoryAffinity = clamp(territoryTotals[territory] / componentSignals.length);

    const internal = edges.filter((item) => componentSet.has(item.a) && componentSet.has(item.b) && item.a !== item.b);
    const possiblePairs = component.length * (component.length - 1) / 2;
    const weighted = internal.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
    const cohesion = clamp(possiblePairs === 0 ? 0 : (weighted / possiblePairs) * 1_000);
    return {
      id: componentId(component),
      name: packName(territory, component),
      members: component,
      reputation,
      territory,
      territoryAffinity,
      cohesion,
    };
  }).sort((a, b) => a.members[0]! < b.members[0]! ? -1 : 1);
}

export function inferPackRelations(
  packs: readonly EmergentPack[],
  edges: readonly SocialEdge[],
): PackRelation[] {
  const owner = new Map<bigint, Hex>();
  for (const pack of packs) for (const tokenId of pack.members) owner.set(tokenId, pack.id);
  const aggregates = new Map<string, { aPackId: Hex; bPackId: Hex; affinity: number; weight: number; count: number }>();
  for (const edge of edges) {
    const aPack = owner.get(edge.a);
    const bPack = owner.get(edge.b);
    if (aPack === undefined || bPack === undefined || aPack === bPack) continue;
    const [first, second] = aPack < bPack ? [aPack, bPack] : [bPack, aPack];
    const key = `${first}:${second}`;
    const current = aggregates.get(key) ?? { aPackId: first, bPackId: second, affinity: 0, weight: 0, count: 0 };
    current.affinity += edge.affinity;
    current.weight += Math.max(0, edge.weight);
    current.count += 1;
    aggregates.set(key, current);
  }
  return [...aggregates.values()].map((item) => {
    const affinity = clamp(item.affinity / item.count, -10_000, 10_000);
    const rivalry = clamp(Math.max(0, -affinity) * 5 + item.weight * 100);
    return { aPackId: item.aPackId, bPackId: item.bPackId, affinity, rivalry, evidenceWeight: item.weight };
  }).sort((a, b) => a.aPackId.localeCompare(b.aPackId) || a.bPackId.localeCompare(b.bPackId));
}

export function packMigrationSuggestions(
  packs: readonly EmergentPack[],
  edges: readonly SocialEdge[],
): PackMigrationSuggestion[] {
  const packByMember = new Map<bigint, EmergentPack>();
  for (const pack of packs) for (const tokenId of pack.members) packByMember.set(tokenId, pack);
  const result: PackMigrationSuggestion[] = [];

  for (const [tokenId, currentPack] of packByMember) {
    let internalWeight = 0;
    const external = new Map<Hex, number>();
    for (const edge of edges) {
      let peer: bigint | undefined;
      if (edge.a === tokenId) peer = edge.b;
      else if (edge.b === tokenId) peer = edge.a;
      if (peer === undefined) continue;
      const peerPack = packByMember.get(peer);
      if (peerPack === undefined) continue;
      const weight = Math.max(0, edge.weight);
      if (peerPack.id === currentPack.id) internalWeight += weight;
      else external.set(peerPack.id, (external.get(peerPack.id) ?? 0) + weight);
    }
    const best = [...external.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (best !== undefined && best[1] >= Math.max(5, internalWeight * 1.5)) {
      result.push({ tokenId, fromPackId: currentPack.id, toPackId: best[0], internalWeight, externalWeight: best[1] });
    }
  }

  return result.sort((a, b) => a.tokenId < b.tokenId ? -1 : a.tokenId > b.tokenId ? 1 : 0);
}
