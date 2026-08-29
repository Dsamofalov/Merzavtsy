import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { createDaemonApplication, DEFAULT_HIGH_GAS_THRESHOLD } from "../src/composition.js";
import { DaemonStore } from "../src/store.js";

const identity = "0x1111111111111111111111111111111111111111" as Address;
const world = "0x2222222222222222222222222222222222222222" as Address;
const oracle = "0x3333333333333333333333333333333333333333" as Address;
const zeroHash = `0x${"00".repeat(32)}` as Hex;

function config() {
  return {
    rpcUrl: "http://127.0.0.1:8545",
    chainId: 31337n,
    identityAddress: identity,
    worldAddress: world,
    oracleAddress: oracle,
    oraclePrivateKey: `0x${"11".repeat(32)}` as Hex,
    submitterPrivateKey: `0x${"22".repeat(32)}` as Hex,
    dbPath: ":memory:",
    finalityDepth: 1n,
    epochBlocks: 20n,
    pollIntervalMs: 250,
    localMode: true,
  };
}

describe("daemon composition", () => {
  it("assembles one runnable service from the narrow runtime interfaces", async () => {
    const store = new DaemonStore(":memory:");
    const calls: string[] = [];
    const io = {
      async bornEvents() { calls.push("born"); return []; },
      async indexedEvents() { calls.push("events"); return []; },
      submissionGateway() {
        return {
          async activityNonce() { return 0n; },
          async peerNonce() { return 0n; },
          async epochConsumed() { return false; },
          async peerConsumed() { return false; },
          async broadcastActivity() { return zeroHash; },
          async broadcastPeer() { return zeroHash; },
          async waitForReceipt() { return "success" as const; },
        };
      },
      async lifeState() { return { lastLifeTickAt: 0n, hibernating: false }; },
      async sendLifeTick() { calls.push("life"); return zeroHash; },
      async now() { return 1_900_000_000n; },
    };

    const app = createDaemonApplication({
      config: config(),
      deploymentBlock: 100n,
      store,
      oracleSigner: privateKeyToAccount(`0x${"11".repeat(32)}`),
      io,
      async getHeadBlock() { return 100n; },
      async getBlocks() { throw new Error("no finalized range expected"); },
      async destinationHasCode() { return false; },
    });

    assert.equal(DEFAULT_HIGH_GAS_THRESHOLD, 150_000n);
    assert.equal(app.service.pollIntervalMs, 250);
    await app.service.runOnce();
    assert.deepEqual(calls, []);
    store.close();
  });
});
