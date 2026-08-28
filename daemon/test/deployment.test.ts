import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDeploymentMetadata } from "../src/deployment.js";

const identity = "0x1111111111111111111111111111111111111111";
const world = "0x2222222222222222222222222222222222222222";
const oracle = "0x3333333333333333333333333333333333333333";

function json(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    chainId: "11155111",
    identityAddress: identity,
    worldAddress: world,
    oracleAddress: oracle,
    deploymentBlock: "123456",
    deployedAt: "2026-08-28T08:00:00.000Z",
    ...overrides,
  });
}

describe("deployment metadata", () => {
  it("parses canonical deployment metadata", () => {
    const deployment = parseDeploymentMetadata(json());
    assert.deepEqual(deployment, {
      chainId: 11155111n,
      identityAddress: identity,
      worldAddress: world,
      oracleAddress: oracle,
      deploymentBlock: 123456n,
      deployedAt: "2026-08-28T08:00:00.000Z",
    });
  });

  it("rejects malformed or zero identities", () => {
    for (const field of ["identityAddress", "worldAddress", "oracleAddress"] as const) {
      assert.throws(
        () => parseDeploymentMetadata(json({ [field]: "0x0000000000000000000000000000000000000000" })),
        new RegExp(field),
      );
      assert.throws(
        () => parseDeploymentMetadata(json({ [field]: "0x1234" })),
        new RegExp(field),
      );
    }
  });

  it("rejects unsafe chain and block values", () => {
    for (const value of ["0", "-1", "1.5", "abc", 31337]) {
      assert.throws(() => parseDeploymentMetadata(json({ chainId: value })), /chainId/);
    }
    for (const value of ["0", "-1", "1.5", "abc", 123]) {
      assert.throws(() => parseDeploymentMetadata(json({ deploymentBlock: value })), /deploymentBlock/);
    }
  });

  it("rejects invalid timestamps and malformed JSON", () => {
    assert.throws(() => parseDeploymentMetadata(json({ deployedAt: "yesterday" })), /deployedAt/);
    assert.throws(() => parseDeploymentMetadata("{"), /deployment metadata JSON/);
  });
});
