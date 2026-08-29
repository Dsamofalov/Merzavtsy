import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateBootstrap } from "../src/bootstrap.js";
import type { RuntimeConfig } from "../src/config.js";
import type { DeploymentMetadata } from "../src/deployment.js";

const identity = "0x1111111111111111111111111111111111111111";
const world = "0x2222222222222222222222222222222222222222";
const oracle = "0x3333333333333333333333333333333333333333";
const other = "0x4444444444444444444444444444444444444444";

const config: RuntimeConfig = {
  rpcUrl: "https://rpc.example.invalid",
  chainId: 11155111n,
  identityAddress: identity,
  worldAddress: world,
  oracleAddress: oracle,
  oraclePrivateKey: `0x${"11".repeat(32)}`,
  submitterPrivateKey: `0x${"22".repeat(32)}`,
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
  deploymentBlock: 123456n,
  deployedAt: "2026-08-28T08:00:00.000Z",
};

function chainState(overrides: Record<string, unknown> = {}) {
  return {
    chainId: 11155111n,
    identityWorld: world,
    worldOracle: oracle,
    oracleIdentity: identity,
    oracleWorld: world,
    identityHasCode: true,
    worldHasCode: true,
    oracleHasCode: true,
    ...overrides,
  };
}

describe("runtime bootstrap validation", () => {
  it("accepts matching deployment and on-chain wiring", () => {
    assert.doesNotThrow(() => validateBootstrap(config, deployment, chainState()));
  });

  it("rejects the wrong RPC chain before runtime starts", () => {
    assert.throws(
      () => validateBootstrap(config, deployment, chainState({ chainId: 1n })),
      /RPC chainId mismatch/,
    );
  });

  it("rejects missing bytecode at any configured contract address", () => {
    for (const field of ["identityHasCode", "worldHasCode", "oracleHasCode"] as const) {
      assert.throws(
        () => validateBootstrap(config, deployment, chainState({ [field]: false })),
        /has no bytecode/,
      );
    }
  });

  it("rejects mismatched deployment addresses and on-chain wiring", () => {
    assert.throws(
      () => validateBootstrap({ ...config, oracleAddress: other }, deployment, chainState()),
      /deployment oracleAddress mismatch/,
    );
    assert.throws(
      () => validateBootstrap(config, deployment, chainState({ identityWorld: other })),
      /identity\.world mismatch/,
    );
    assert.throws(
      () => validateBootstrap(config, deployment, chainState({ worldOracle: other })),
      /world\.oracle mismatch/,
    );
    assert.throws(
      () => validateBootstrap(config, deployment, chainState({ oracleIdentity: other })),
      /oracle\.identity mismatch/,
    );
    assert.throws(
      () => validateBootstrap(config, deployment, chainState({ oracleWorld: other })),
      /oracle\.world mismatch/,
    );
  });
});
