import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address, Hex } from "viem";
import { EventIndexer } from "../src/indexer.js";
import { DaemonStore } from "../src/store.js";

const ADDRESS = "0x3000000000000000000000000000000000000003" as Address;
const TX = `0x${"44".repeat(32)}` as Hex;

describe("EventIndexer", () => {
  it("ignores an exact log replay but keeps distinct log indexes from one transaction", () => {
    const store = new DaemonStore(":memory:");
    const indexer = new EventIndexer(store);
    try {
      const first = {
        txHash: TX,
        logIndex: 0,
        blockNumber: 100n,
        address: ADDRESS,
        eventName: "Born",
        payload: { tokenId: "1" },
      };
      assert.equal(indexer.recordEvent(first), true);
      assert.equal(indexer.recordEvent(first), false);
      assert.equal(indexer.recordEvent({ ...first, logIndex: 1, eventName: "Locked" }), true);

      const events = store.eventsForTransaction(TX);
      assert.equal(events.length, 2);
      assert.deepEqual(events.map((event) => event.logIndex), [0, 1]);
    } finally {
      store.close();
    }
  });
});
