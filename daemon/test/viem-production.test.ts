import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address, Hex } from "viem";
import { createViemProductionAdapter } from "../src/viem-production.js";

const identity = "0x1111111111111111111111111111111111111111" as Address;
const world = "0x2222222222222222222222222222222222222222" as Address;
const oracle = "0x3333333333333333333333333333333333333333" as Address;
const owner = "0x4444444444444444444444444444444444444444" as Address;
const tx = `0x${"aa".repeat(32)}` as Hex;
const blockHash = `0x${"bb".repeat(32)}` as Hex;

function clients(calls: string[]) {
  const publicClient = {
    async getChainId() { calls.push("chainId"); return 11155111; },
    async getBytecode({ address, blockNumber }: { address: Address; blockNumber?: bigint }) {
      calls.push(`bytecode:${address}:${blockNumber ?? "latest"}`);
      return "0x6000" as Hex;
    },
    async readContract(request: { address: Address; functionName: string; args?: readonly unknown[] }) {
      calls.push(`read:${request.address}:${request.functionName}`);
      if (request.functionName === "world" && request.address === identity) return world;
      if (request.functionName === "oracle") return oracle;
      if (request.functionName === "identity") return identity;
      if (request.functionName === "world") return world;
      if (request.functionName === "nonces") return 4n;
      if (request.functionName === "peerNonces") return 5n;
      if (request.functionName === "processedEpoch") return false;
      if (request.functionName === "processedPeerEncounter") return false;
      if (request.functionName === "stateOf") return { lastLifeTickAt: 123n, hibernating: false };
      throw new Error(`unexpected read ${request.functionName}`);
    },
    async getLogs(request: { address: Address; event?: unknown; fromBlock: bigint; toBlock: bigint }) {
      calls.push(`logs:${request.address}:${request.fromBlock}-${request.toBlock}:${request.event ? "event" : "raw"}`);
      if (request.event) {
        return [{
          args: { tokenId: 7n, owner, birthBlock: 100n },
          blockNumber: 100n,
          transactionHash: tx,
          logIndex: 2,
        }];
      }
      return [{
        address: request.address,
        blockNumber: 100n,
        transactionHash: tx,
        logIndex: 3,
        topics: [blockHash],
        data: "0x",
      }];
    },
    async waitForTransactionReceipt({ hash }: { hash: Hex }) {
      calls.push(`receipt:${hash}`);
      return { status: "success" as const };
    },
    async getBlock(request: { blockNumber?: bigint; blockTag?: string; includeTransactions?: boolean }) {
      if (request.blockTag === "latest") return { timestamp: 1_900_000_000n };
      calls.push(`block:${request.blockNumber}:${request.includeTransactions === true}`);
      return {
        number: request.blockNumber ?? 100n,
        hash: blockHash,
        parentHash: `0x${"cc".repeat(32)}` as Hex,
        timestamp: 1_900_000_000n,
        transactions: [{ hash: tx, from: owner, to: world, value: 1n, input: "0x" as Hex }],
      };
    },
    async getTransactionReceipt({ hash }: { hash: Hex }) {
      calls.push(`txReceipt:${hash}`);
      return {
        transactionHash: hash,
        blockNumber: 100n,
        blockHash,
        gasUsed: 21_000n,
        contractAddress: null,
      };
    },
    async getBlockNumber() { calls.push("head"); return 120n; },
  };

  const walletClient = {
    async writeContract(request: { address: Address; functionName: string }) {
      calls.push(`write:${request.address}:${request.functionName}`);
      return tx;
    },
  };
  return { publicClient, walletClient };
}

describe("viem production adapter", () => {
  it("maps public and wallet client operations onto runtime interfaces", async () => {
    const calls: string[] = [];
    const { publicClient, walletClient } = clients(calls);
    const adapter = createViemProductionAdapter({
      addresses: { identity, world, oracle },
      publicClient,
      walletClient,
    });

    assert.equal(await adapter.production.getChainId(), 11155111n);
    assert.equal(await adapter.production.hasCode(identity), true);
    assert.equal(await adapter.production.readIdentityWorld(), world);
    assert.equal(await adapter.production.readWorldOracle(), oracle);
    assert.equal(await adapter.production.readOracleIdentity(), identity);
    assert.equal(await adapter.production.readOracleWorld(), world);
    assert.equal((await adapter.production.getBornLogs(90n, 110n)).length, 1);
    assert.equal((await adapter.production.getRawLogs(world, 90n, 110n)).length, 1);
    assert.equal(await adapter.production.activityNonce(owner), 4n);
    assert.equal(await adapter.production.peerNonce(owner), 5n);
    assert.equal(await adapter.production.epochConsumed(7n, blockHash), false);
    assert.equal(await adapter.production.peerConsumed(blockHash), false);
    assert.equal(await adapter.production.waitForReceipt(tx), "success");
    assert.deepEqual(await adapter.production.readLifeState(7n), { lastLifeTickAt: 123n, hibernating: false });
    assert.equal(await adapter.production.sendLifeTick(7n), tx);
    assert.equal(await adapter.production.latestBlockTimestamp(), 1_900_000_000n);

    assert.equal(await adapter.getHeadBlock(), 120n);
    assert.equal(await adapter.destinationHasCode(world, 100n), true);
    assert.equal((await adapter.blocks.getBlock(100n)).number, 100n);
    assert.equal((await adapter.blocks.getReceipt(tx)).gasUsed, 21_000n);
  });
});
