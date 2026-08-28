import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Hex } from "viem";
import { RpcBlockSource } from "../src/rpc-source.js";
import type { RpcBlockLike, RpcReceiptLike } from "../src/rpc-blocks.js";

const alice = "0x1111111111111111111111111111111111111111";
const bob = "0x2222222222222222222222222222222222222222";

function hash(byte: string): Hex {
  return `0x${byte.repeat(64)}` as Hex;
}

function block(number: bigint): RpcBlockLike {
  const txHash = hash(number === 5n ? "a" : "b");
  return {
    number,
    hash: hash(number === 5n ? "5" : "6"),
    parentHash: hash(number === 5n ? "4" : "5"),
    timestamp: 1_700_000_000n + number,
    transactions: [{
      hash: txHash,
      from: alice,
      to: bob,
      value: number,
      input: "0x",
    }],
  };
}

function receipt(number: bigint, txHash: string): RpcReceiptLike {
  return {
    transactionHash: txHash,
    blockNumber: number,
    blockHash: hash(number === 5n ? "5" : "6"),
    gasUsed: 21_000n,
    contractAddress: null,
  };
}

describe("RpcBlockSource", () => {
  it("fetches an inclusive block range and joins every transaction receipt", async () => {
    const blockCalls: bigint[] = [];
    const receiptCalls: string[] = [];
    const source = new RpcBlockSource(11155111n, {
      async getBlock(number) {
        blockCalls.push(number);
        return block(number);
      },
      async getReceipt(txHash) {
        receiptCalls.push(txHash);
        const number = txHash === hash("a") ? 5n : 6n;
        return receipt(number, txHash);
      },
    });

    const result = await source.getBlocks(5n, 6n);

    assert.deepEqual(blockCalls, [5n, 6n]);
    assert.deepEqual(receiptCalls, [hash("a"), hash("b")]);
    assert.deepEqual(result.map((item) => item.number), [5n, 6n]);
    assert.deepEqual(result.map((item) => item.transactions[0]?.gasUsed), [21_000n, 21_000n]);
  });

  it("does not fetch receipts for empty blocks", async () => {
    let receiptCalls = 0;
    const source = new RpcBlockSource(1n, {
      async getBlock(number) {
        return { ...block(number), transactions: [] };
      },
      async getReceipt() {
        receiptCalls += 1;
        throw new Error("must not run");
      },
    });

    const result = await source.getBlocks(5n, 5n);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.transactions.length, 0);
    assert.equal(receiptCalls, 0);
  });

  it("rejects invalid or excessively large ranges before network I/O", async () => {
    let calls = 0;
    const source = new RpcBlockSource(1n, {
      async getBlock() {
        calls += 1;
        return block(5n);
      },
      async getReceipt() {
        throw new Error("unused");
      },
    }, 100n);

    await assert.rejects(source.getBlocks(6n, 5n), /invalid block range/);
    await assert.rejects(source.getBlocks(1n, 101n), /exceeds configured maximum/);
    assert.equal(calls, 0);
  });
});
