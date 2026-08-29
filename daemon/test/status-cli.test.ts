import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address } from "viem";
import { collectStatus } from "../../scripts/status.js";

const identity = "0x1111111111111111111111111111111111111111" as Address;
const world = "0x2222222222222222222222222222222222222222" as Address;
const oracle = "0x3333333333333333333333333333333333333333" as Address;

const deployment = {
  chainId: 11155111n,
  identityAddress: identity,
  worldAddress: world,
  oracleAddress: oracle,
  deploymentBlock: 123n,
  deployedAt: "2026-08-28T10:00:00.000Z",
};

describe("status CLI", () => {
  it("reports a healthy deployment only when chain, bytecode and wiring all match", async () => {
    const status = await collectStatus(deployment, {
      async getChainId() { return 11155111n; },
      async hasCode() { return true; },
      async readIdentityWorld() { return world; },
      async readWorldOracle() { return oracle; },
      async readOracleIdentity() { return identity; },
      async readOracleWorld() { return world; },
      async headBlock() { return 999n; },
    });

    assert.deepEqual(status, {
      healthy: true,
      chainId: 11155111n,
      headBlock: 999n,
      deploymentBlock: 123n,
      identityAddress: identity,
      worldAddress: world,
      oracleAddress: oracle,
      deployedAt: "2026-08-28T10:00:00.000Z",
      problems: [],
    });
  });

  it("returns all topology problems instead of partially claiming health", async () => {
    const wrong = "0x9999999999999999999999999999999999999999" as Address;
    const status = await collectStatus(deployment, {
      async getChainId() { return 1n; },
      async hasCode(address) { return address !== world; },
      async readIdentityWorld() { return wrong; },
      async readWorldOracle() { return wrong; },
      async readOracleIdentity() { return wrong; },
      async readOracleWorld() { return wrong; },
      async headBlock() { return 999n; },
    });

    assert.equal(status.healthy, false);
    assert.deepEqual(status.problems, [
      "chainId mismatch: expected 11155111, got 1",
      `no bytecode at world ${world}`,
      `identity.world mismatch: expected ${world}, got ${wrong}`,
      `world.oracle mismatch: expected ${oracle}, got ${wrong}`,
      `oracle.identity mismatch: expected ${identity}, got ${wrong}`,
      `oracle.world mismatch: expected ${world}, got ${wrong}`,
    ]);
  });
});
