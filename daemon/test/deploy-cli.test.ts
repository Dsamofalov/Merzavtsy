import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address, Hex } from "viem";
import { runDeployment } from "../../scripts/deploy.js";

const deployer = "0x1111111111111111111111111111111111111111" as Address;
const signer = "0x2222222222222222222222222222222222222222" as Address;
const identity = "0x3333333333333333333333333333333333333333" as Address;
const world = "0x4444444444444444444444444444444444444444" as Address;
const oracle = "0x5555555555555555555555555555555555555555" as Address;

function driver(calls: string[]) {
  let deployment = 0;
  return {
    async chainId() { return 11155111n; },
    async deployerAddress() { return deployer; },
    async deployerBalance() { return 10n ** 18n; },
    async deploy(contract: string, args: readonly unknown[]) {
      calls.push(`deploy:${contract}:${args.map(String).join(",")}`);
      deployment += 1;
      const address = [identity, world, oracle][deployment - 1];
      if (!address) throw new Error("unexpected deployment");
      return { address, blockNumber: BigInt(100 + deployment), txHash: `0x${String(deployment).padStart(64, "0")}` as Hex };
    },
    async write(address: Address, functionName: string, args: readonly unknown[]) {
      calls.push(`write:${address}:${functionName}:${args.map(String).join(",")}`);
      return `0x${"aa".repeat(32)}` as Hex;
    },
  };
}

describe("deployment CLI workflow", () => {
  it("deploys identity, world and oracle in dependency order and writes canonical metadata", async () => {
    const calls: string[] = [];
    let savedPath = "";
    let saved = "";
    const result = await runDeployment({
      chainId: 11155111n,
      oracleSigner: signer,
      allowMainnet: false,
      driver: driver(calls),
      now: () => new Date("2026-08-28T10:00:00.000Z"),
      async writeText(path, content) { savedPath = path; saved = content; },
      log() {},
    });

    assert.deepEqual(calls, [
      `deploy:Merzavets:${deployer}`,
      `deploy:MerzavetsWorld:${identity},${deployer}`,
      `write:${identity}:setWorld:${world}`,
      `deploy:ActivityOracle:${world},${identity},${deployer},${signer}`,
      `write:${world}:setOracle:${oracle}`,
    ]);
    assert.equal(savedPath, "deployments/11155111.json");
    assert.equal(result.identityAddress, identity);
    assert.equal(result.worldAddress, world);
    assert.equal(result.oracleAddress, oracle);
    assert.equal(result.deploymentBlock, 101n);
    assert.deepEqual(JSON.parse(saved), {
      chainId: "11155111",
      identityAddress: identity,
      worldAddress: world,
      oracleAddress: oracle,
      deploymentBlock: "101",
      deployedAt: "2026-08-28T10:00:00.000Z",
    });
  });

  it("rejects Ethereum mainnet before any deployment without an explicit opt-in", async () => {
    let touched = false;
    const mainnetDriver = {
      ...driver([]),
      async chainId() { touched = true; return 1n; },
    };
    await assert.rejects(
      runDeployment({
        chainId: 1n,
        oracleSigner: signer,
        allowMainnet: false,
        driver: mainnetDriver,
        now: () => new Date(),
        async writeText() {},
        log() {},
      }),
      /ALLOW_MAINNET_DEPLOY/,
    );
    assert.equal(touched, false);
  });

  it("rejects a driver connected to a different chain", async () => {
    const wrongDriver = { ...driver([]), async chainId() { return 1n; } };
    await assert.rejects(
      runDeployment({
        chainId: 11155111n,
        oracleSigner: signer,
        allowMainnet: false,
        driver: wrongDriver,
        now: () => new Date(),
        async writeText() {},
        log() {},
      }),
      /connected chain mismatch/,
    );
  });
});
