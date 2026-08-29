import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address } from "viem";
import { parseAuditSignerAllowlist } from "../src/activity-feed.js";

const signerA = "0x1111111111111111111111111111111111111111" as Address;
const signerB = "0x2222222222222222222222222222222222222222" as Address;

describe("activity feed audit signer allowlist", () => {
  it("fails closed when no authorized signer allowlist is configured", () => {
    assert.throws(() => parseAuditSignerAllowlist({}), /ORACLE_SIGNER/i);
  });

  it("accepts multiple explicit signer addresses and removes duplicates", () => {
    assert.deepEqual(
      parseAuditSignerAllowlist({ ORACLE_SIGNER_ADDRESSES: `${signerA}, ${signerB}, ${signerA}` }),
      [signerA, signerB],
    );
    assert.deepEqual(parseAuditSignerAllowlist({ ORACLE_SIGNER_ADDRESS: signerA }), [signerA]);
  });

  it("rejects malformed and zero-address signer allowlists", () => {
    assert.throws(() => parseAuditSignerAllowlist({ ORACLE_SIGNER_ADDRESSES: `${signerA},wat` }), /address/i);
    assert.throws(
      () => parseAuditSignerAllowlist({ ORACLE_SIGNER_ADDRESS: "0x0000000000000000000000000000000000000000" }),
      /non-zero/i,
    );
  });
});
