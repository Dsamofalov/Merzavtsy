import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address, Hex } from "viem";
import { DaemonStore } from "../src/store.js";

const txHash = `0x${"44".repeat(32)}` as Hex;
const address = "0x1111111111111111111111111111111111111111" as Address;

describe("forward-compatible indexed-event schema", () => {
  it("persists future gossip/opinion structured payloads without a schema migration", () => {
    const store = new DaemonStore(":memory:");
    try {
      const payload = {
        schemaVersion: 2,
        kind: "GOSSIP_OPINION",
        actorTokenId: "1",
        subjectTokenId: "2",
        targetTokenId: "3",
        opinion: { affinity: -250, trust: 80, tags: ["rival", "noisy"] },
        provenance: { sourceMemoryKind: 5, confidenceBps: 7300 },
      };
      store.recordEvent({ txHash, logIndex: 0, blockNumber: 100n, address, eventName: "FutureStructuredEvent", payload });
      const restored = store.eventsForTransaction(txHash)[0]!;
      assert.deepEqual(restored.payload, payload);
    } finally {
      store.close();
    }
  });
});
