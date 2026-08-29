import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RuntimeConfig } from "../src/config.js";
import type { DeploymentMetadata } from "../src/deployment.js";
import {
  deploymentPath,
  openStoreAfterBootstrap,
} from "../src/startup.js";

const identity = "0x1111111111111111111111111111111111111111" as const;
const world = "0x2222222222222222222222222222222222222222" as const;
const oracle = "0x3333333333333333333333333333333333333333" as const;

const config: RuntimeConfig = {
  rpcUrl: "https://rpc.example.invalid",
  chainId: 11155111n,
  identityAddress: identity,
  worldAddress: world,
  oracleAddress: oracle,
  oraclePrivateKey: `0x${"44".repeat(32)}`,
  submitterPrivateKey: `0x${"55".repeat(32)}`,
  dbPath: "/data/merzavtsy.sqlite",
  finalityDepth: 64n,
  epochBlocks: 128n,
  pollIntervalMs: 5000,
  localMode: false,
};

const deployment: DeploymentMetadata = {
  chainId: 11155111n,
  identityAddress: identity,
  worldAddress: world,
  oracleAddress: oracle,
  deploymentBlock: 100n,
  deployedAt: "2026-08-28T00:00:00.000Z",
};

function chainState(chainId = 11155111n) {
  return {
    chainId,
    identityWorld: world,
    worldOracle: oracle,
    oracleIdentity: identity,
    oracleWorld: world,
    identityHasCode: true,
    worldHasCode: true,
    oracleHasCode: true,
  };
}

describe("production startup", () => {
  it("uses one canonical deployment metadata path per chain", () => {
    assert.equal(deploymentPath(11155111n), "deployments/11155111.json");
    assert.throws(() => deploymentPath(0n), /positive/);
  });

  it("validates RPC topology before opening the SQLite store", async () => {
    const calls: string[] = [];
    const store = { close() {} };
    const result = await openStoreAfterBootstrap(
      config,
      deployment,
      async () => {
        calls.push("chain");
        return chainState();
      },
      () => {
        calls.push("store");
        return store;
      },
    );

    assert.equal(result, store);
    assert.deepEqual(calls, ["chain", "store"]);
  });

  it("never opens the database when bootstrap validation fails", async () => {
    let opened = 0;
    await assert.rejects(
      openStoreAfterBootstrap(
        config,
        deployment,
        async () => chainState(1n),
        () => {
          opened += 1;
          return { close() {} };
        },
      ),
      /RPC chainId mismatch/,
    );
    assert.equal(opened, 0);
  });
});
