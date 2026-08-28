import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { RuntimePhases, type RuntimeDependencies } from "../src/runtime.js";
import { createRuntimeSubmitter, type RuntimeSubmissionGateway } from "../src/runtime-wiring.js";
import { DaemonStore } from "../src/store.js";
import type { ObservedBlock, ObservedTransaction, EpochSummary } from "../src/types.js";
import type { PeerObservation } from "../src/peer-attestation.js";

const alice = "0x1111111111111111111111111111111111111111" as Address;
const bob = "0x2222222222222222222222222222222222222222" as Address;
const oracle = "0x3333333333333333333333333333333333333333" as Address;
const zeroHash = `0x${"00".repeat(32)}` as Hex;

function hash(value: bigint): Hex {
  return `0x${value.toString(16).padStart(64, "0")}` as Hex;
}

function block(number: bigint, parentHash: Hex, transactions: ObservedTransaction[] = []): ObservedBlock {
  return {
    number,
    hash: hash(number),
    parentHash,
    timestamp: number * 12n,
    transactions,
  };
}

function transfer(blockNumber: bigint): ObservedTransaction {
  return {
    chainId: 31337n,
    blockNumber,
    blockHash: hash(blockNumber),
    txHash: `0x${"ab".repeat(31)}${Number(blockNumber % 255n).toString(16).padStart(2, "0")}` as Hex,
    from: alice,
    to: bob,
    value: 1n,
    gasUsed: 21_000n,
    input: "0x",
    createdContract: null,
  };
}

function summary(): EpochSummary {
  return {
    wallet: alice,
    tokenId: 1n,
    chainId: 31337n,
    fromBlock: 11n,
    toBlock: 11n,
    epochId: `0x${"11".repeat(32)}` as Hex,
    activityDigest: `0x${"22".repeat(32)}` as Hex,
    xpDelta: 10n,
    personalityDeltas: [0, 0, 0, 0, 0, 0, 0, 0],
    needDeltas: [0, 0, 0, 0, 0],
    categoryCounters: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };
}

function peerObservation(): PeerObservation {
  return {
    actorWallet: alice,
    actorTokenId: 1n,
    peerWallet: bob,
    peerTokenId: 2n,
    chainId: 31337n,
    blockNumber: 11n,
    encounterDigest: `0x${"44".repeat(32)}` as Hex,
  };
}

describe("operational hardening", () => {
  it("emits structured JSON and redacts secret-bearing fields and strings while preserving tx hashes", async () => {
    const module = await import("../src/logger.js");
    const lines: string[] = [];
    const secret = `0x${"55".repeat(32)}`;
    const txHash = `0x${"66".repeat(32)}`;
    const logger = new module.JsonLogger(
      (line: string) => lines.push(line),
      () => new Date("2026-08-28T12:00:00.000Z"),
    );

    logger.info("secret_probe", {
      oraclePrivateKey: secret,
      rpcUrl: "https://user:password@rpc.example/v2/demo?apiKey=top-secret",
      authorization: "Bearer hidden",
      nested: { submitterPrivateKey: secret, safe: "visible" },
      message: `request failed ORACLE_PRIVATE_KEY=${secret} token=super-secret`,
      txHash,
    });

    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    assert.equal(parsed.level, "info");
    assert.equal(parsed.event, "secret_probe");
    assert.equal(parsed.timestamp, "2026-08-28T12:00:00.000Z");
    const fields = parsed.fields as Record<string, unknown>;
    assert.equal(fields.oraclePrivateKey, "[REDACTED]");
    assert.equal(fields.rpcUrl, "[REDACTED]");
    assert.equal(fields.authorization, "[REDACTED]");
    assert.equal((fields.nested as Record<string, unknown>).submitterPrivateKey, "[REDACTED]");
    assert.equal((fields.nested as Record<string, unknown>).safe, "visible");
    assert.ok(!String(fields.message).includes(secret));
    assert.ok(!String(fields.message).includes("super-secret"));
    assert.equal(fields.txHash, txHash);
  });

  it("logs chain progress, registry size, epoch lifecycle, classification and keeper outcomes", async () => {
    const records: Array<{ level: string; event: string; fields?: Record<string, unknown> }> = [];
    const logger = {
      debug(event: string, fields?: Record<string, unknown>) { records.push({ level: "debug", event, fields }); },
      info(event: string, fields?: Record<string, unknown>) { records.push({ level: "info", event, fields }); },
      warn(event: string, fields?: Record<string, unknown>) { records.push({ level: "warn", event, fields }); },
      error(event: string, fields?: Record<string, unknown>) { records.push({ level: "error", event, fields }); },
    };
    const store = new DaemonStore(":memory:");
    const dependencies = {
      store,
      logger,
      chainId: 31337n,
      deploymentBlock: 10n,
      finalityDepth: 1n,
      epochBlocks: 10n,
      highGasThreshold: 100_000n,
      async getHeadBlock() { return 12n; },
      async getBornEvents() {
        return [
          { owner: alice, tokenId: 1n, birthBlock: 10n, txHash: hash(101n), logIndex: 0 },
          { owner: bob, tokenId: 2n, birthBlock: 10n, txHash: hash(102n), logIndex: 0 },
        ];
      },
      async getIndexedEvents() { return []; },
      async getBlocks() { return [block(10n, zeroHash), block(11n, hash(10n), [transfer(11n)])]; },
      async destinationHasCode() { return false; },
      async submitPending() {},
      async getLifeCandidates() {
        return [{ tokenId: 1n, initialized: true, lastLifeTickAt: 0n, hibernating: false }];
      },
      async sendLifeTick() {},
      async now() { return 30_000n; },
    } as unknown as RuntimeDependencies;

    try {
      const runtime = new RuntimePhases(dependencies);
      await runtime.syncRegistryAndIndexer();
      await runtime.processFinalizedBlocks();
      await runtime.persistEpochs();
      await runtime.submitEpochs();
      await runtime.runLifeKeeper();

      const events = new Set(records.map((record) => record.event));
      for (const expected of [
        "chain_progress",
        "registered_wallet_count",
        "epoch_opened",
        "activities_classified",
        "epoch_closed",
        "keeper_tick_result",
      ]) {
        assert.ok(events.has(expected), `missing operational log ${expected}`);
      }
    } finally {
      store.close();
    }
  });

  it("logs signing, tx hashes, replay skips and submission RPC failures without leaking secrets", async () => {
    const module = await import("../src/logger.js");
    const records: Array<{ level: string; event: string; fields?: Record<string, unknown> }> = [];
    const logger = {
      debug(event: string, fields?: Record<string, unknown>) { records.push({ level: "debug", event, fields }); },
      info(event: string, fields?: Record<string, unknown>) { records.push({ level: "info", event, fields }); },
      warn(event: string, fields?: Record<string, unknown>) { records.push({ level: "warn", event, fields }); },
      error(event: string, fields?: Record<string, unknown>) { records.push({ level: "error", event, fields: module.redactLogValue(fields) as Record<string, unknown> }); },
    };
    const store = new DaemonStore(":memory:");
    store.putEpoch(summary());
    store.putPeerEncounter(peerObservation());
    const signer = privateKeyToAccount(`0x${"77".repeat(32)}`);
    const activityTx = `0x${"88".repeat(32)}` as Hex;
    const secret = `0x${"99".repeat(32)}`;
    let activityBroadcasts = 0;
    const gateway: RuntimeSubmissionGateway = {
      async activityNonce() { return 0n; },
      async peerNonce() { return 0n; },
      async epochConsumed() { return false; },
      async peerConsumed() { return true; },
      async broadcastActivity() { activityBroadcasts += 1; return activityTx; },
      async broadcastPeer() { throw new Error(`ORACLE_PRIVATE_KEY=${secret}`); },
      async waitForReceipt() { return "success"; },
    };

    try {
      const submit = createRuntimeSubmitter({
        store,
        oracleAddress: oracle,
        oracleSigner: signer,
        now: async () => 1_900_000_000n,
        gateway,
        logger,
      } as never);
      await submit();

      assert.equal(activityBroadcasts, 1);
      const events = records.map((record) => record.event);
      assert.ok(events.includes("attestation_signed"));
      assert.ok(events.includes("submitted_tx"));
      assert.ok(events.includes("replay_skip"));
      const submitted = records.find((record) => record.event === "submitted_tx");
      assert.equal(submitted?.fields?.txHash, activityTx);
    } finally {
      store.close();
    }
  });

  it("logs RPC failures and redacts their messages before rethrowing", async () => {
    const module = await import("../src/logger.js");
    const records: Array<{ event: string; fields?: Record<string, unknown> }> = [];
    const logger = {
      debug() {}, info() {}, warn() {},
      error(event: string, fields?: Record<string, unknown>) {
        records.push({ event, fields: module.redactLogValue(fields) as Record<string, unknown> });
      },
    };
    const store = new DaemonStore(":memory:");
    const secret = `0x${"aa".repeat(32)}`;
    const dependencies = {
      store,
      logger,
      chainId: 31337n,
      deploymentBlock: 10n,
      finalityDepth: 1n,
      epochBlocks: 10n,
      highGasThreshold: 100_000n,
      async getHeadBlock() { throw new Error(`RPC failed SUBMITTER_PRIVATE_KEY=${secret}`); },
      async getBornEvents() { return []; }, async getIndexedEvents() { return []; }, async getBlocks() { return []; },
      async destinationHasCode() { return false; }, async submitPending() {}, async getLifeCandidates() { return []; },
      async sendLifeTick() {}, async now() { return 0n; },
    } as unknown as RuntimeDependencies;

    try {
      const runtime = new RuntimePhases(dependencies);
      await assert.rejects(runtime.syncRegistryAndIndexer(), /RPC failed/);
      const failure = records.find((record) => record.event === "rpc_failed");
      assert.ok(failure);
      assert.equal(failure.fields?.operation, "getHeadBlock");
      assert.ok(!JSON.stringify(failure).includes(secret));
    } finally {
      store.close();
    }
  });

  it("detects a durable-parent mismatch, alerts, engages fail-stop, survives restart and requires explicit acknowledgement", async () => {
    const records: Array<{ level: string; event: string; fields?: Record<string, unknown> }> = [];
    const logger = {
      debug() {}, info() {}, warn() {},
      error(event: string, fields?: Record<string, unknown>) { records.push({ level: "error", event, fields }); },
    };
    const store = new DaemonStore(":memory:");
    store.recordProcessedBlock(10n, hash(10n), zeroHash);
    const dependencies = {
      store,
      logger,
      chainId: 31337n,
      deploymentBlock: 10n,
      finalityDepth: 1n,
      epochBlocks: 10n,
      highGasThreshold: 100_000n,
      async getHeadBlock() { return 12n; },
      async getBornEvents() { return []; }, async getIndexedEvents() { return []; },
      async getBlocks() { return [block(11n, hash(999n))]; },
      async destinationHasCode() { return false; }, async submitPending() {}, async getLifeCandidates() { return []; },
      async sendLifeTick() {}, async now() { return 0n; },
    } as unknown as RuntimeDependencies;

    try {
      const runtime = new RuntimePhases(dependencies);
      await runtime.syncRegistryAndIndexer();
      await assert.rejects(runtime.processFinalizedBlocks(), /deep reorg/i);
      assert.ok(records.some((record) => record.event === "reorg_detected"));
      assert.match(String((store as any).failStopReason()), /deep reorg/i);

      const restarted = new RuntimePhases(dependencies);
      await assert.rejects(restarted.syncRegistryAndIndexer(), /fail-stop/i);
      assert.equal((store as any).clearFailStop(), true);
      assert.equal((store as any).failStopReason(), null);
    } finally {
      store.close();
    }
  });
});
