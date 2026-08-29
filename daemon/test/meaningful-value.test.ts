import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address, Hex } from "viem";
import { classifyTransaction } from "../src/classifier.js";
import { ActivityCategory, type ClassifierContext, type ObservedTransaction } from "../src/types.js";

const wallet = "0x1111111111111111111111111111111111111111" as Address;
const peer = "0x2222222222222222222222222222222222222222" as Address;
const hash = `0x${"11".repeat(32)}` as Hex;

function tx(value: bigint): ObservedTransaction {
  return {
    chainId: 1n,
    blockNumber: 100n,
    blockHash: hash,
    txHash: hash,
    from: wallet,
    to: peer,
    value,
    gasUsed: 21_000n,
    input: "0x",
    createdContract: null,
  };
}

function context(overrides: Partial<ClassifierContext> = {}): ClassifierContext {
  return {
    wallet,
    tokenId: 1n,
    registeredPeers: new Map(),
    knownContracts: new Set(),
    seenContracts: new Set(),
    seenCounterparties: new Set(),
    seenSelectors: new Set(),
    highGasThreshold: 1_000_000n,
    destinationHasCode: false,
    minimumMeaningfulWei: 1_000n,
    ...overrides,
  };
}

describe("minimum meaningful value filtering", () => {
  it("does not award plain-transfer progression below the configured wei threshold", () => {
    const categories = classifyTransaction(tx(1n), context()).map((item) => item.category);
    assert.equal(categories.includes(ActivityCategory.TX_SENT), false);
    assert.equal(categories.includes(ActivityCategory.UNIQUE_COUNTERPARTY), false);
  });

  it("keeps registered-peer contact observable even when transferred value is tiny", () => {
    const categories = classifyTransaction(
      tx(1n),
      context({ registeredPeers: new Map([[peer.toLowerCase(), 2n]]) }),
    ).map((item) => item.category);
    assert.equal(categories.includes(ActivityCategory.REGISTERED_PEER_CONTACT), true);
    assert.equal(categories.includes(ActivityCategory.TX_SENT), false);
  });

  it("counts a plain transfer at or above the configured threshold", () => {
    const categories = classifyTransaction(tx(1_000n), context()).map((item) => item.category);
    assert.equal(categories.includes(ActivityCategory.TX_SENT), true);
    assert.equal(categories.includes(ActivityCategory.UNIQUE_COUNTERPARTY), true);
  });
});
