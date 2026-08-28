import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { createDaemonApplication } from "../src/composition.js";
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

describe("release operations", () => {
  it("propagates the structured logger through production composition", async () => {
    const store = new DaemonStore(":memory:");
    const events: string[] = [];
    const logger = {
      debug(event: string) { events.push(event); },
      info(event: string) { events.push(event); },
      warn(event: string) { events.push(event); },
      error(event: string) { events.push(event); },
    };
    const io = {
      async bornEvents() { return []; },
      async indexedEvents() { return []; },
      submissionGateway() {
        return {
          async activityNonce() { return 0n; }, async peerNonce() { return 0n; },
          async epochConsumed() { return false; }, async peerConsumed() { return false; },
          async broadcastActivity() { return zeroHash; }, async broadcastPeer() { return zeroHash; },
          async waitForReceipt() { return "success" as const; },
        };
      },
      async lifeState() { return { lastLifeTickAt: 0n, hibernating: false }; },
      async sendLifeTick() { return zeroHash; },
      async now() { return 1_900_000_000n; },
    };
    try {
      const app = createDaemonApplication({
        config: config(), deploymentBlock: 100n, store,
        oracleSigner: privateKeyToAccount(`0x${"11".repeat(32)}`), io,
        logger,
        async getHeadBlock() { return 100n; },
        async getBlocks() { return []; },
        async destinationHasCode() { return false; },
      } as never);
      await app.service.runOnce();
      assert.ok(events.includes("chain_progress"));
      assert.ok(events.includes("registered_wallet_count"));
    } finally {
      store.close();
    }
  });

  it("requires exact operator acknowledgement before clearing a durable deep-reorg fail-stop", async () => {
    const control = await import("../../scripts/reorg-control.js");
    const store = new DaemonStore(":memory:");
    try {
      // Runtime imports install the durable operational-store methods.
      await import("../src/runtime.js");
      (store as any).engageFailStop("deep reorg detected at block 123");
      assert.throws(
        () => control.clearReorgFailStop(store, "yes"),
        /ACKNOWLEDGE_DEEP_REORG/i,
      );
      assert.match((store as any).failStopReason(), /deep reorg/i);
      assert.equal(
        control.clearReorgFailStop(store, control.DEEP_REORG_ACKNOWLEDGEMENT),
        true,
      );
      assert.equal((store as any).failStopReason(), null);
    } finally {
      store.close();
    }
  });

  it("ships operator and security documentation with local, Sepolia and guarded-mainnet instructions", async () => {
    const [readme, concept, architecture, operations, security] = await Promise.all([
      readFile("README.md", "utf8"),
      readFile("CONCEPT.md", "utf8"),
      readFile("ARCHITECTURE.md", "utf8"),
      readFile("OPERATIONS.md", "utf8"),
      readFile("SECURITY.md", "utf8"),
    ]);

    assert.match(readme, /local/i);
    assert.match(readme, /Sepolia/i);
    assert.match(readme, /11155111/);
    assert.match(readme, /before mainnet/i);
    assert.match(readme, /ALLOW_MAINNET_DEPLOY=true/);
    assert.match(readme, /npm run deploy/);
    assert.match(concept, /one.*account.*one.*creature/is);
    assert.match(concept, /no financial|non-financial/i);
    assert.match(architecture, /EIP-712/i);
    assert.match(architecture, /SQLite/i);
    assert.match(architecture, /finality/i);
    assert.match(operations, /deep reorg/i);
    assert.match(operations, /fail-stop/i);
    assert.match(operations, /npm run reorg:status/);
    assert.match(operations, /npm run reorg:clear/);
    assert.match(operations, /ACKNOWLEDGE_DEEP_REORG/);
    assert.match(security, /oracle.*submitter/is);
    assert.match(security, /redact/i);
    assert.match(security, /no custody|non-custodial/i);
  });

  it("pins the manual Sepolia proof workflow to real verification, deployment, smoke and artifact capture", async () => {
    const workflow = await readFile(".github/workflows/sepolia-proof.yml", "utf8").catch(() => "");

    assert.match(workflow, /workflow_dispatch:/, "Sepolia proof workflow must be manually gated");
    assert.match(workflow, /CHAIN_ID:\s*["']?11155111["']?/, "Sepolia chain ID must be pinned");
    assert.match(workflow, /SEPOLIA_RPC_URL/, "workflow must receive Sepolia RPC through Actions secrets");
    assert.match(workflow, /SEPOLIA_DEPLOYER_PRIVATE_KEY/, "workflow must receive deployer key through Actions secrets");
    assert.match(workflow, /npm run verify/, "repository verification must pass before touching Sepolia");
    assert.match(workflow, /npm run deploy/, "workflow must perform a real deployment");
    assert.match(workflow, /npm run smoke:sepolia/, "workflow must run the fail-closed Sepolia smoke command");
    assert.match(workflow, /actions\/upload-artifact@v4/, "workflow must preserve proof artifacts");
    assert.match(workflow, /proofs\/sepolia-smoke\.json/, "smoke proof must be uploaded");
    assert.match(workflow, /deployments\/11155111\.json/, "deployment metadata must be uploaded alongside the proof");
  });
});
