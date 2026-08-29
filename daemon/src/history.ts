import type { Hex } from "viem";
import { renderEventDescription } from "./narrative.js";
import type { IndexedEvent } from "./store.js";

export interface TimelineEntry {
  blockNumber: bigint;
  txHash: Hex;
  eventName: string;
  text: string;
}

export interface HistoryAnalytics {
  totalEvents: number;
  eventCounts: Record<string, number>;
  firstBlock: bigint | null;
  lastBlock: bigint | null;
  uniqueTransactions: number;
}

function sorted(events: readonly IndexedEvent[]): IndexedEvent[] {
  return [...events].sort((a, b) =>
    a.blockNumber < b.blockNumber ? -1
      : a.blockNumber > b.blockNumber ? 1
        : a.logIndex - b.logIndex || a.txHash.localeCompare(b.txHash),
  );
}

function json(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "bigint" ? item.toString() : item,
  ) ?? "";
}

export function renderTimeline(events: readonly IndexedEvent[]): TimelineEntry[] {
  return sorted(events).map((event) => ({
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventName: event.eventName,
    text: renderEventDescription(event),
  }));
}

export function searchHistory(
  events: readonly IndexedEvent[],
  query: string,
): IndexedEvent[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return sorted(events);

  if (normalized.startsWith("token:")) {
    const token = normalized.slice("token:".length).trim();
    if (!/^\d+$/.test(token)) return [];
    return sorted(events).filter((event) => {
      const payload = event.payload;
      return Object.entries(payload).some(([key, value]) =>
        /tokenid$/i.test(key) && String(value) === token,
      );
    });
  }

  return sorted(events).filter((event) =>
    `${event.eventName} ${json(event.payload)}`.toLowerCase().includes(normalized),
  );
}

export function analyzeHistory(events: readonly IndexedEvent[]): HistoryAnalytics {
  const ordered = sorted(events);
  const eventCounts: Record<string, number> = {};
  const transactions = new Set<string>();
  for (const event of ordered) {
    eventCounts[event.eventName] = (eventCounts[event.eventName] ?? 0) + 1;
    transactions.add(event.txHash.toLowerCase());
  }
  return {
    totalEvents: ordered.length,
    eventCounts,
    firstBlock: ordered[0]?.blockNumber ?? null,
    lastBlock: ordered.at(-1)?.blockNumber ?? null,
    uniqueTransactions: transactions.size,
  };
}
