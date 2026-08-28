import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address, Hex } from "viem";
import {
  ProductionIo,
  type ProductionIoDependencies,
} from "../src/production-io.js";

const identity = "0x1111111111111111111111111111111111111111" as Address;
const world = "0x2222222222222222222222222222222222222222" as Address;
const oracle = "0x3333333333333333333333333333333333333333" as Address;
const owner = "0x4444444444444444444444444444444444444444" as Address;
const peer = "0x5555555555555555555555555555555555555555" as Address;
const tx = `0x${"aa".repeat(32)}` as Hex;
const digest = `0x${"bb".repeat(32)}` as Hex;
const signature = `0x${"66".repeat(65)}` as Hex;

function dependencies(calls: string[]): ProductionIoDependencies {
  return {
    async getChainId() { calls.push("chain"); return 11155111n; },
    async hasCode(address) { calls.push(`code:${address}`); return true; },
    async readIdentityWorld() { calls.push("identity.world"); return world; },
    async readWorldOracle() { calls.push("world.oracle"); return oracle; },
    async readOracleIdentity() { calls.push("oracle.identity"); return identity; },
    async readOracleWorld() { calls.push("oracle.world"); return world; },
    async getBornLogs(fromBlock, toBlock) {
      calls.push(`born:${fromBlock}-${toBlock}`);
      return [{
        args: { tokenId: 7n, owner, birthBlock: 100n },
        blockNumber: 100n,
        transactionHash: tx,
        logIndex: 3,
      }];
    },
    async getRawLogs(address, fromBlock, toBlock) {
      calls.push(`logs:${address}:${fromBlock}-${toBlock}`);
      return [{
        address,
        blockNumber: 100n,
        transactionHash: tx,
        logIndex: address === identity ? 1 : address === world ? 2 : 3,
        topics: [digest],
        data: "0x1234",
      }];
    },
    async activityNonce(wallet) { calls.push(`activityNonce:${wallet}`); return 4n; },
    async peerNonce(wallet) { calls.push(`peerNonce:${wallet}`); return 5n; },
    async epochConsumed(tokenId, epochId) {
      calls.push(`epochConsumed:${tokenId}:${epochId}`);
      return false;
    },
    async peerConsumed(encounterDigest) {
      calls.push(`peerConsumed:${encounterDigest}`);
      return false;
    },
    async submitActivity(attestation, sig) {
      calls.push(`submitActivity:${attestation.nonce}:${sig}`);
      return tx;
    },
    async submitPeer(attestation, sig) {
      calls.push(`submitPeer:${attestation.nonce}:${sig}`);
      return tx;
    },
    async waitForReceipt(hash) { calls.push(`receipt:${hash}`); return "success"; },
    async readLifeState(tokenId) {
      calls.push(`state:${tokenId}`);
      return { lastLifeTickAt: 123, hibernating: false };
    },
    async sendLifeTick(tokenId) { calls.push(`life:${tokenId}`); return tx; },
    async latestBlockTimestamp() { calls.push("time"); return 1_900_000_000n; },
  };
}

describe("ProductionIo", () => {
  it("reads and validates bootstrap topology through one facade", async () => {
    const calls: string[] = [];
    const io = new ProductionIo({ identity, world, oracle }, dependencies(calls));
    const state = await io.bootstrapState();

    assert.deepEqual(state, {
      chainId: 11155111n,
      identityWorld: world,
      worldOracle: oracle,
      oracleIdentity: identity,
      oracleWorld: world,
      identityHasCode: true,
      worldHasCode: true,
      oracleHasCode: true,
    });
    assert.deepEqual(calls, [
      "chain",
      `code:${identity}`,
      `code:${world}`,
      `code:${oracle}`,
      "identity.world",
      "world.oracle",
      "oracle.identity",
      "oracle.world",
    ]);
  });

  it("normalizes Born and raw logs from all three contracts", async () => {
    const calls: string[] = [];
    const io = new ProductionIo({ identity, world, oracle }, dependencies(calls));

    const births = await io.bornEvents(90n, 110n);
    const events = await io.indexedEvents(90n, 110n);

    assert.deepEqual(births, [{ owner, tokenId: 7n, birthBlock: 100n, txHash: tx, logIndex: 3 }]);
    assert.deepEqual(events.map((event) => event.address), [identity, world, oracle]);
    assert.deepEqual(events.map((event) => event.logIndex), [1, 2, 3]);
  });

  it("exposes the crash-safe submitter gateway and life operations", async () => {
    const calls: string[] = [];
    const io = new ProductionIo({ identity, world, oracle }, dependencies(calls));
    const gateway = io.submissionGateway();

    assert.equal(await gateway.activityNonce(owner), 4n);
    assert.equal(await gateway.peerNonce(owner), 5n);
    assert.equal(await gateway.epochConsumed(7n, digest), false);
    assert.equal(await gateway.peerConsumed(digest), false);

    const activity = {
      wallet: owner,
      tokenId: 7n,
      chainId: 11155111n,
      fromBlock: 90n,
      toBlock: 110n,
      epochId: digest,
      activityDigest: digest,
      xpDelta: 1n,
      personalityDeltas: [0, 0, 0, 0, 0, 0, 0, 0] as const,
      needDeltas: [0, 0, 0, 0, 0] as const,
      categoryCounters: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] as const,
      nonce: 4n,
      deadline: 2_000_000_000n,
    };
    const peerAttestation = {
      actorWallet: owner,
      actorTokenId: 7n,
      peerWallet: peer,
      peerTokenId: 8n,
      chainId: 11155111n,
      blockNumber: 100n,
      encounterDigest: digest,
      nonce: 5n,
      deadline: 2_000_000_000n,
    };

    assert.equal(await gateway.broadcastActivity({ attestation: activity, signature }), tx);
    assert.equal(await gateway.broadcastPeer({ attestation: peerAttestation, signature }), tx);
    assert.equal(await gateway.waitForReceipt(tx), "success");
    assert.deepEqual(await io.lifeState(7n), { lastLifeTickAt: 123n, hibernating: false });
    assert.equal(await io.sendLifeTick(7n), tx);
    assert.equal(await io.now(), 1_900_000_000n);
  });
});
