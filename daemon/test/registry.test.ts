import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address } from "viem";
import { Registry } from "../src/registry.js";
import { DaemonStore } from "../src/store.js";

const ALICE = "0x1000000000000000000000000000000000000001" as Address;
const BOB = "0x2000000000000000000000000000000000000002" as Address;

describe("Registry", () => {
  it("applies Born events idempotently and resolves wallet/token mappings", () => {
    const store = new DaemonStore(":memory:");
    const registry = new Registry(store);
    try {
      assert.equal(registry.applyBorn(ALICE, 1n, 100n), true);
      assert.equal(registry.applyBorn(ALICE, 1n, 100n), false);
      assert.equal(registry.tokenForWallet(ALICE), 1n);
      assert.equal(registry.walletForToken(1n), ALICE.toLowerCase());
      assert.equal(registry.tokenForWallet(BOB), null);
    } finally {
      store.close();
    }
  });

  it("rejects remapping an existing wallet or token to a different identity", () => {
    const store = new DaemonStore(":memory:");
    const registry = new Registry(store);
    try {
      registry.applyBorn(ALICE, 1n, 100n);
      assert.throws(() => registry.applyBorn(ALICE, 2n, 101n), /registry conflict/i);
      assert.throws(() => registry.applyBorn(BOB, 1n, 101n), /registry conflict/i);
    } finally {
      store.close();
    }
  });
});
