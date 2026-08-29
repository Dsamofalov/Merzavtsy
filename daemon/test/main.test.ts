import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address, Hex, LocalAccount } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { prepareProductionDaemon } from "../src/main.js";
import { DaemonStore } from "../src/store.js";

const identity = "0x1111111111111111111111111111111111111111" as Address;
const world = "0x2222222222222222222222222222222222222222" as Address;
const oracle = "0x3333333333333333333333333333333333333333" as Address;
const tx = `0x${"aa".repeat(32)}` as Hex;

function env(): NodeJS.ProcessEnv {
  return {
    RPC_URL: "http://127.0.0.1:8545",
    CHAIN_ID: "31337",
    IDENTITY_ADDRESS: identity,
    WORLD_ADDRESS: world,
    ORACLE_ADDRESS: oracle,
    ORACLE_PRIVATE_KEY: `0x${"11".repeat(32)}`,
    SUBMITTER_PRIVATE_KEY: `0x${"22".repeat(32)}`,
    DB_PATH: ":memory:",
    FINALITY_DEPTH: "1",
    EPOCH_BLOCKS: "20",
    POLL_INTERVAL_MS: "250",
  };
}

function runtimeIo(calls: string[] = []) {
  return {
    async bootstrapState() {
      calls.push("bootstrap");
      return {
        chainId: 31337n,
        identityWorld: world,
        worldOracle: oracle,
        oracleIdentity: identity,
        oracleWorld: world,
        identityHasCode: true,
        worldHasCode: true,
        oracleHasCode: true,
      };
    },
    async bornEvents() { return []; },
    async indexedEvents() { return []; },
    submissionGateway() {
      return {
        async activityNonce() { return 0n; },
        async peerNonce() { return 0n; },
        async epochConsumed() { return false; },
        async peerConsumed() { return false; },
        async broadcastActivity() { return tx; },
        async broadcastPeer() { return tx; },
        async waitForReceipt() { return "success" as const; },
      };
    },
    async lifeState() { return { lastLifeTickAt: 0n, hibernating: false }; },
    async sendLifeTick() { return tx; },
    async now() { return 1_900_000_000n; },
  };
}

function metadata() {
  return JSON.stringify({
    chainId: "31337",
    identityAddress: identity,
    worldAddress: world,
    oracleAddress: oracle,
    deploymentBlock: "100",
    deployedAt: "2026-08-28T00:00:00.000Z",
  });
}

describe("production daemon startup", () => {
  it("loads matching deployment metadata, validates topology, then opens the durable store", async () => {
    const calls: string[] = [];
    const oracleSigner = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const io = runtimeIo(calls);

    const prepared = await prepareProductionDaemon(env(), {
      async readText(path) {
        calls.push(`read:${path}`);
        return metadata();
      },
      createNetwork() {
        calls.push("network");
        return {
          io,
          oracleSigner: oracleSigner as LocalAccount,
          async getHeadBlock() { return 100n; },
          async getBlocks() { throw new Error("no finalized blocks expected"); },
          async destinationHasCode() { return false; },
        };
      },
      openStore(path) {
        calls.push(`store:${path}`);
        return new DaemonStore(path);
      },
    });

    assert.deepEqual(calls, [
      "read:deployments/31337.json",
      "network",
      "bootstrap",
      "store::memory:",
    ]);
    assert.equal(prepared.deployment.deploymentBlock, 100n);
    assert.equal(prepared.service.pollIntervalMs, 250);
    prepared.store.close();
  });

  it("propagates an injectable logger so production runtime emits structured phase signals", async () => {
    const events: string[] = [];
    const logger = {
      debug(event: string) { events.push(event); },
      info(event: string) { events.push(event); },
      warn(event: string) { events.push(event); },
      error(event: string) { events.push(event); },
    };
    const oracleSigner = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const prepared = await prepareProductionDaemon(env(), {
      async readText() { return metadata(); },
      createNetwork() {
        return {
          io: runtimeIo(),
          oracleSigner: oracleSigner as LocalAccount,
          async getHeadBlock() { return 100n; },
          async getBlocks() { throw new Error("no finalized blocks expected"); },
          async destinationHasCode() { return false; },
        };
      },
      openStore(path: string) { return new DaemonStore(path); },
      logger,
    } as never);

    try {
      await prepared.service.runOnce();
      assert.ok(events.includes("chain_progress"));
      assert.ok(events.includes("registered_wallet_count"));
    } finally {
      prepared.store.close();
    }
  });

  it("does not open SQLite when deployment metadata disagrees with environment", async () => {
    let opened = false;
    await assert.rejects(
      prepareProductionDaemon(env(), {
        async readText() {
          return JSON.stringify({
            chainId: "31337",
            identityAddress: "0x9999999999999999999999999999999999999999",
            worldAddress: world,
            oracleAddress: oracle,
            deploymentBlock: "100",
            deployedAt: "2026-08-28T00:00:00.000Z",
          });
        },
        createNetwork() { throw new Error("network must not be created"); },
        openStore() { opened = true; return new DaemonStore(":memory:"); },
      }),
      /identityAddress mismatch/,
    );
    assert.equal(opened, false);
  });
});
