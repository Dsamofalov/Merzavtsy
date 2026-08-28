import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DaemonStore } from "../src/store.js";

const alice = "0x1111111111111111111111111111111111111111";
const bob = "0x2222222222222222222222222222222222222222";
const contractAddress = "0x3333333333333333333333333333333333333333";
const txHash = `0x${"aa".repeat(32)}` as const;

describe("runtime store primitives", () => {
  it("lists the durable registry in token-id order", () => {
    const store = new DaemonStore(":memory:");
    store.recordBirth(bob, 2n, 12n);
    store.recordBirth(alice, 1n, 10n);

    assert.deepEqual(store.registeredCreatures(), [
      { wallet: alice, tokenId: 1n, birthBlock: 10n },
      { wallet: bob, tokenId: 2n, birthBlock: 12n },
    ]);
    store.close();
  });

  it("persists seen contracts, selectors and counterparties", () => {
    const store = new DaemonStore(":memory:");

    assert.equal(store.recordContractDestination(alice, contractAddress, 100n), true);
    assert.equal(store.recordContractDestination(alice, contractAddress, 101n), false);
    assert.equal(store.recordSelector(alice, "0x12345678", 100n), true);
    assert.equal(store.recordSelector(alice, "0x12345678", 101n), false);
    assert.equal(store.recordCounterparty(alice, bob, 100n), true);
    assert.equal(store.recordCounterparty(alice, bob, 101n), false);

    assert.deepEqual([...store.contractDestinations(alice)], [contractAddress]);
    assert.deepEqual([...store.selectorsForWallet(alice)], ["0x12345678"]);
    assert.deepEqual([...store.counterpartiesForWallet(alice)], [bob]);
    store.close();
  });

  it("rolls back a multi-write commit atomically", () => {
    const store = new DaemonStore(":memory:");

    assert.throws(() => store.transaction(() => {
      store.recordBirth(alice, 1n, 10n);
      store.recordContractDestination(alice, contractAddress, 10n);
      throw new Error("boom");
    }), /boom/);

    assert.deepEqual(store.registeredCreatures(), []);
    assert.deepEqual([...store.contractDestinations(alice)], []);
    store.close();
  });

  it("serializes bigint event payloads without losing the event", () => {
    const store = new DaemonStore(":memory:");
    store.recordEvent({
      txHash,
      logIndex: 0,
      blockNumber: 100n,
      address: contractAddress,
      eventName: "Born",
      payload: { tokenId: 1n, birthBlock: 100n },
    });

    assert.deepEqual(store.eventsForTransaction(txHash)[0]?.payload, {
      tokenId: "1",
      birthBlock: "100",
    });
    store.close();
  });
});
