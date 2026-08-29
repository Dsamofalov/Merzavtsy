import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeBornLog,
  normalizeIndexedLog,
  normalizeLifeState,
} from "../src/viem-adapter.js";

const identity = "0x1111111111111111111111111111111111111111" as const;
const owner = "0x2222222222222222222222222222222222222222" as const;
const txHash = `0x${"aa".repeat(32)}` as const;
const topic = `0x${"bb".repeat(32)}` as const;

describe("viem runtime adapter normalization", () => {
  it("normalizes a complete Born log", () => {
    const born = normalizeBornLog({
      args: { tokenId: 7n, owner, birthBlock: 123n },
      blockNumber: 123n,
      transactionHash: txHash,
      logIndex: 4,
    });
    assert.deepEqual(born, {
      owner,
      tokenId: 7n,
      birthBlock: 123n,
      txHash,
      logIndex: 4,
    });
  });

  it("rejects incomplete Born logs instead of inventing identifiers", () => {
    assert.throws(
      () => normalizeBornLog({
        args: { tokenId: 7n, owner, birthBlock: 123n },
        blockNumber: null,
        transactionHash: txHash,
        logIndex: 4,
      }),
      /Born blockNumber is required/,
    );
    assert.throws(
      () => normalizeBornLog({
        args: { tokenId: undefined, owner, birthBlock: 123n },
        blockNumber: 123n,
        transactionHash: txHash,
        logIndex: 4,
      }),
      /Born tokenId is required/,
    );
  });

  it("normalizes raw indexed logs without lossy JSON values", () => {
    const event = normalizeIndexedLog({
      address: identity,
      blockNumber: 123n,
      transactionHash: txHash,
      logIndex: 4,
      topics: [topic],
      data: "0x1234",
    });
    assert.equal(event.eventName, topic);
    assert.deepEqual(event.payload, { topics: [topic], data: "0x1234" });
  });

  it("normalizes life state integer widths to bigint", () => {
    assert.deepEqual(
      normalizeLifeState({ lastLifeTickAt: 123, hibernating: true }),
      { lastLifeTickAt: 123n, hibernating: true },
    );
    assert.deepEqual(
      normalizeLifeState({ lastLifeTickAt: 456n, hibernating: false }),
      { lastLifeTickAt: 456n, hibernating: false },
    );
  });
});
