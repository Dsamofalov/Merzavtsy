import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address, Hex } from "viem";
import { ActivityCategory, classifyTransaction } from "../src/classifier.js";
import type { ClassifierContext, ObservedTransaction } from "../src/types.js";

const WALLET = "0x1000000000000000000000000000000000000001" as Address;
const PEER = "0x2000000000000000000000000000000000000002" as Address;
const CONTRACT = "0x3000000000000000000000000000000000000003" as Address;
const CREATED = "0x4000000000000000000000000000000000000004" as Address;

function tx(overrides: Partial<ObservedTransaction> = {}): ObservedTransaction {
  return {
    chainId: 31337n,
    blockNumber: 100n,
    blockHash: `0x${"11".repeat(32)}` as Hex,
    txHash: `0x${"22".repeat(32)}` as Hex,
    from: WALLET,
    to: PEER,
    value: 1n,
    gasUsed: 21_000n,
    input: "0x",
    createdContract: null,
    ...overrides,
  };
}

function context(overrides: Partial<ClassifierContext> = {}): ClassifierContext {
  return {
    wallet: WALLET,
    tokenId: 1n,
    registeredPeers: new Map([[PEER.toLowerCase(), 2n]]),
    knownContracts: new Set<string>(),
    seenContracts: new Set<string>(),
    seenCounterparties: new Set<string>(),
    seenSelectors: new Set<string>(),
    highGasThreshold: 150_000n,
    destinationHasCode: false,
    ...overrides,
  };
}

function categories(result: ReturnType<typeof classifyTransaction>) {
  return result.map((item) => item.category);
}

describe("daemon classifier", () => {
  it("classifies plain ETH sends and receives from the registered wallet perspective", () => {
    const sent = classifyTransaction(tx(), context());
    assert.ok(categories(sent).includes(ActivityCategory.TX_SENT));
    assert.ok(categories(sent).includes(ActivityCategory.UNIQUE_COUNTERPARTY));
    assert.ok(categories(sent).includes(ActivityCategory.REGISTERED_PEER_CONTACT));
    assert.equal(sent.find((item) => item.category === ActivityCategory.REGISTERED_PEER_CONTACT)?.peerTokenId, 2n);

    const received = classifyTransaction(
      tx({ from: PEER, to: WALLET }),
      context(),
    );
    assert.ok(categories(received).includes(ActivityCategory.TX_RECEIVED));
    assert.ok(!categories(received).includes(ActivityCategory.TX_SENT));
  });

  it("distinguishes new and repeated contract calls and selector diversity", () => {
    const input = "0xa9059cbb0000000000000000000000000000000000000000000000000000000000000000" as Hex;
    const first = classifyTransaction(
      tx({ to: CONTRACT, input, gasUsed: 175_000n }),
      context({ destinationHasCode: true }),
    );

    assert.deepEqual(
      new Set(categories(first)),
      new Set([
        ActivityCategory.TX_SENT,
        ActivityCategory.CONTRACT_CALL,
        ActivityCategory.NEW_CONTRACT,
        ActivityCategory.UNIQUE_COUNTERPARTY,
        ActivityCategory.HIGH_GAS_ACTIVITY,
        ActivityCategory.SELECTOR_DIVERSITY,
      ]),
    );
    assert.equal(first.find((item) => item.category === ActivityCategory.SELECTOR_DIVERSITY)?.selector, "0xa9059cbb");

    const repeated = classifyTransaction(
      tx({ to: CONTRACT, input }),
      context({
        destinationHasCode: true,
        seenContracts: new Set([CONTRACT.toLowerCase()]),
        seenCounterparties: new Set([CONTRACT.toLowerCase()]),
        seenSelectors: new Set(["0xa9059cbb"]),
      }),
    );

    assert.ok(categories(repeated).includes(ActivityCategory.REPEAT_CONTRACT));
    assert.ok(!categories(repeated).includes(ActivityCategory.NEW_CONTRACT));
    assert.ok(!categories(repeated).includes(ActivityCategory.SELECTOR_DIVERSITY));
    assert.ok(!categories(repeated).includes(ActivityCategory.UNIQUE_COUNTERPARTY));
  });

  it("classifies contract deployment separately from ordinary calls", () => {
    const deployed = classifyTransaction(
      tx({ to: null, input: "0x60006000" as Hex, gasUsed: 400_000n, createdContract: CREATED }),
      context(),
    );

    assert.ok(categories(deployed).includes(ActivityCategory.CONTRACT_DEPLOY));
    assert.ok(categories(deployed).includes(ActivityCategory.HIGH_GAS_ACTIVITY));
    assert.ok(!categories(deployed).includes(ActivityCategory.CONTRACT_CALL));
  });

  it("uses the exact Solidity category index layout", () => {
    assert.deepEqual(
      [
        ActivityCategory.TX_SENT,
        ActivityCategory.TX_RECEIVED,
        ActivityCategory.CONTRACT_CALL,
        ActivityCategory.NEW_CONTRACT,
        ActivityCategory.REPEAT_CONTRACT,
        ActivityCategory.CONTRACT_DEPLOY,
        ActivityCategory.UNIQUE_COUNTERPARTY,
        ActivityCategory.REGISTERED_PEER_CONTACT,
        ActivityCategory.HIGH_GAS_ACTIVITY,
        ActivityCategory.SELECTOR_DIVERSITY,
      ],
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    );
  });
});
