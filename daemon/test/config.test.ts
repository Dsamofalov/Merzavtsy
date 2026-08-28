import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.js";

const addressA = "0x1111111111111111111111111111111111111111";
const addressB = "0x2222222222222222222222222222222222222222";
const addressC = "0x3333333333333333333333333333333333333333";
const keyA = `0x${"11".repeat(32)}`;
const keyB = `0x${"22".repeat(32)}`;

function productionEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    RPC_URL: "https://rpc.example.invalid",
    CHAIN_ID: "11155111",
    IDENTITY_ADDRESS: addressA,
    WORLD_ADDRESS: addressB,
    ORACLE_ADDRESS: addressC,
    ORACLE_PRIVATE_KEY: keyA,
    SUBMITTER_PRIVATE_KEY: keyB,
    DB_PATH: "/data/merzavtsy.sqlite",
    FINALITY_DEPTH: "64",
    EPOCH_BLOCKS: "128",
    POLL_INTERVAL_MS: "5000",
    ...overrides,
  };
}

describe("runtime config", () => {
  it("parses an explicit production configuration", () => {
    const config = loadConfig(productionEnv());

    assert.equal(config.rpcUrl, "https://rpc.example.invalid");
    assert.equal(config.chainId, 11155111n);
    assert.equal(config.identityAddress, addressA);
    assert.equal(config.worldAddress, addressB);
    assert.equal(config.oracleAddress, addressC);
    assert.equal(config.oraclePrivateKey, keyA);
    assert.equal(config.submitterPrivateKey, keyB);
    assert.equal(config.dbPath, "/data/merzavtsy.sqlite");
    assert.equal(config.finalityDepth, 64n);
    assert.equal(config.epochBlocks, 128n);
    assert.equal(config.pollIntervalMs, 5000);
    assert.equal(config.localMode, false);
  });

  it("rejects missing or malformed chain identity", () => {
    for (const chainId of [undefined, "", "0", "-1", "1.5", "abc"]) {
      assert.throws(
        () => loadConfig(productionEnv({ CHAIN_ID: chainId })),
        /CHAIN_ID/,
      );
    }

    assert.throws(
      () => loadConfig(productionEnv({ RPC_URL: "not-a-url" })),
      /RPC_URL/,
    );
  });

  it("rejects malformed contract addresses and private keys", () => {
    for (const field of ["IDENTITY_ADDRESS", "WORLD_ADDRESS", "ORACLE_ADDRESS"] as const) {
      assert.throws(
        () => loadConfig(productionEnv({ [field]: "0x1234" })),
        new RegExp(field),
      );
    }

    for (const field of ["ORACLE_PRIVATE_KEY", "SUBMITTER_PRIVATE_KEY"] as const) {
      assert.throws(
        () => loadConfig(productionEnv({ [field]: "0x1234" })),
        new RegExp(field),
      );
    }
  });

  it("rejects unsafe operational bounds", () => {
    for (const finality of [undefined, "", "0", "-1", "1.5", "x"]) {
      assert.throws(
        () => loadConfig(productionEnv({ FINALITY_DEPTH: finality })),
        /FINALITY_DEPTH/,
      );
    }

    for (const epochBlocks of [undefined, "", "0", "-1", "1.5", "x"]) {
      assert.throws(
        () => loadConfig(productionEnv({ EPOCH_BLOCKS: epochBlocks })),
        /EPOCH_BLOCKS/,
      );
    }

    for (const poll of [undefined, "", "0", "-1", "1.5", "x"]) {
      assert.throws(
        () => loadConfig(productionEnv({ POLL_INTERVAL_MS: poll })),
        /POLL_INTERVAL_MS/,
      );
    }
  });

  it("allows only safe operational defaults in explicit local mode", () => {
    const env = productionEnv({
      LOCAL_MODE: "true",
      CHAIN_ID: "31337",
      DB_PATH: undefined,
      FINALITY_DEPTH: undefined,
      POLL_INTERVAL_MS: undefined,
    });
    const config = loadConfig(env);

    assert.equal(config.localMode, true);
    assert.equal(config.dbPath, "./data/merzavtsy.sqlite");
    assert.equal(config.finalityDepth, 1n);
    assert.equal(config.pollIntervalMs, 1000);
    assert.equal(config.epochBlocks, 128n);
  });

  it("does not apply local defaults silently in production", () => {
    assert.throws(
      () => loadConfig(productionEnv({ DB_PATH: undefined })),
      /DB_PATH/,
    );
  });
});
