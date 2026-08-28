import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeObservedBlock } from "../src/rpc-blocks.js";

const blockHash = `0x${"11".repeat(32)}` as const;
const parentHash = `0x${"10".repeat(32)}` as const;
const txHash = `0x${"aa".repeat(32)}` as const;
const alice = "0x1111111111111111111111111111111111111111" as const;
const bob = "0x2222222222222222222222222222222222222222" as const;
const created = "0x3333333333333333333333333333333333333333" as const;

function rpcBlock(overrides: Record<string, unknown> = {}) {
  return {
    number: 42n,
    hash: blockHash,
    parentHash,
    timestamp: 1_700_000_000n,
    transactions: [{
      hash: txHash,
      from: alice,
      to: bob,
      value: 123n,
      input: "0x12345678",
    }],
    ...overrides,
  };
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    transactionHash: txHash,
    blockNumber: 42n,
    blockHash,
    gasUsed: 55_000n,
    contractAddress: null,
    ...overrides,
  };
}

describe("RPC block normalization", () => {
  it("builds the canonical watcher block from a structured block and receipts", () => {
    const observed = normalizeObservedBlock(11155111n, rpcBlock(), [receipt()]);

    assert.equal(observed.number, 42n);
    assert.equal(observed.hash, blockHash);
    assert.equal(observed.parentHash, parentHash);
    assert.equal(observed.timestamp, 1_700_000_000n);
    assert.equal(observed.transactions.length, 1);
    assert.deepEqual(observed.transactions[0], {
      chainId: 11155111n,
      blockNumber: 42n,
      blockHash,
      txHash,
      from: alice,
      to: bob,
      value: 123n,
      gasUsed: 55_000n,
      input: "0x12345678",
      createdContract: null,
    });
  });

  it("uses the receipt contractAddress for deployments", () => {
    const observed = normalizeObservedBlock(
      11155111n,
      rpcBlock({ transactions: [{
        hash: txHash,
        from: alice,
        to: null,
        value: 0n,
        input: "0x6000",
      }] }),
      [receipt({ contractAddress: created })],
    );
    assert.equal(observed.transactions[0]?.createdContract, created);
  });

  it("rejects missing, duplicate or cross-block receipts", () => {
    assert.throws(
      () => normalizeObservedBlock(11155111n, rpcBlock(), []),
      /missing receipt/,
    );
    assert.throws(
      () => normalizeObservedBlock(11155111n, rpcBlock(), [receipt(), receipt()]),
      /duplicate receipt/,
    );
    assert.throws(
      () => normalizeObservedBlock(
        11155111n,
        rpcBlock(),
        [receipt({ blockHash: `0x${"ff".repeat(32)}` })],
      ),
      /receipt block mismatch/,
    );
  });

  it("rejects incomplete pending-style blocks", () => {
    assert.throws(
      () => normalizeObservedBlock(11155111n, rpcBlock({ hash: null }), [receipt()]),
      /finalized block hash is required/,
    );
    assert.throws(
      () => normalizeObservedBlock(11155111n, rpcBlock({ number: null }), [receipt()]),
      /finalized block number is required/,
    );
  });
});
