import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RuntimePhases, type RuntimeDependencies } from "../src/runtime.js";
import { DaemonStore } from "../src/store.js";
import { ActivityCategory, type ObservedBlock, type ObservedTransaction } from "../src/types.js";

const alice = "0x1111111111111111111111111111111111111111";
const bob = "0x2222222222222222222222222222222222222222";
const identity = "0x3333333333333333333333333333333333333333";
const zeroHash = `0x${"00".repeat(32)}` as const;

function transaction(blockNumber: bigint, suffix: string): ObservedTransaction {
  return {
    chainId: 31337n,
    blockNumber,
    blockHash: `0x${suffix.padStart(64, "0")}` as `0x${string}`,
    txHash: `0x${suffix.padStart(64, "a")}` as `0x${string}`,
    from: alice,
    to: bob,
    value: 1n,
    gasUsed: 21_000n,
    input: "0x",
    createdContract: null,
  };
}

function block(number: bigint, txs: ObservedTransaction[] = []): ObservedBlock {
  return {
    number,
    hash: `0x${number.toString(16).padStart(64, "0")}` as `0x${string}`,
    parentHash: number === 0n
      ? zeroHash
      : `0x${(number - 1n).toString(16).padStart(64, "0")}` as `0x${string}`,
    timestamp: number * 12n,
    transactions: txs,
  };
}

describe("RuntimePhases", () => {
  it("syncs registry before finalized classification and persists restart-stable seen state", async () => {
    const store = new DaemonStore(":memory:");
    let head = 12n;
    let submitted = 0;
    let lifeTicks = 0;

    const blocks = new Map<bigint, ObservedBlock>([
      [10n, block(10n)],
      [11n, block(11n, [transaction(11n, "11")])],
      [12n, block(12n, [transaction(12n, "12")])],
    ]);

    const dependencies: RuntimeDependencies = {
      store,
      chainId: 31337n,
      deploymentBlock: 10n,
      finalityDepth: 1n,
      epochBlocks: 10n,
      highGasThreshold: 100_000n,
      async getHeadBlock() { return head; },
      async getBornEvents(fromBlock, toBlock) {
        if (fromBlock <= 10n && toBlock >= 10n) {
          return [{
            owner: alice,
            tokenId: 1n,
            birthBlock: 10n,
            txHash: `0x${"b1".repeat(32)}` as const,
            logIndex: 0,
          }, {
            owner: bob,
            tokenId: 2n,
            birthBlock: 10n,
            txHash: `0x${"b2".repeat(32)}` as const,
            logIndex: 0,
          }];
        }
        return [];
      },
      async getIndexedEvents() { return []; },
      async getBlocks(fromBlock, toBlock) {
        const result: ObservedBlock[] = [];
        for (let current = fromBlock; current <= toBlock; current += 1n) {
          const value = blocks.get(current);
          if (!value) throw new Error(`missing fixture block ${current}`);
          result.push(value);
        }
        return result;
      },
      async destinationHasCode(address) { return address.toLowerCase() === identity; },
      async submitPending() { submitted += 1; },
      async getLifeCandidates() { return []; },
      async sendLifeTick() { lifeTicks += 1; },
      async now() { return 1_000_000n; },
    };

    const runtime = new RuntimePhases(dependencies);
    await runtime.syncRegistryAndIndexer();
    assert.equal(store.tokenForWallet(alice), 1n);
    assert.equal(store.tokenForWallet(bob), 2n);

    await runtime.processFinalizedBlocks();
    await runtime.persistEpochs();
    await runtime.submitEpochs();
    await runtime.runLifeKeeper();

    assert.equal(store.lastProcessedBlock(), 11n);
    assert.equal(submitted, 1);
    assert.equal(lifeTicks, 0);

    const first = store.pendingEpochs();
    assert.equal(first.length, 2);
    const aliceFirst = first.find((epoch) => epoch.summary.wallet.toLowerCase() === alice)!;
    const bobFirst = first.find((epoch) => epoch.summary.wallet.toLowerCase() === bob)!;
    assert.equal(aliceFirst.summary.categoryCounters[ActivityCategory.TX_SENT], 1);
    assert.equal(bobFirst.summary.categoryCounters[ActivityCategory.TX_RECEIVED], 1);
    assert.equal(aliceFirst.summary.categoryCounters[ActivityCategory.UNIQUE_COUNTERPARTY], 1);
    assert.equal(bobFirst.summary.categoryCounters[ActivityCategory.UNIQUE_COUNTERPARTY], 1);
    assert.equal(aliceFirst.summary.categoryCounters[ActivityCategory.REGISTERED_PEER_CONTACT], 1);
    assert.equal(bobFirst.summary.categoryCounters[ActivityCategory.REGISTERED_PEER_CONTACT], 1);

    const firstPeers = store.pendingPeerEncounters();
    assert.equal(firstPeers.length, 1);
    assert.equal(firstPeers[0]?.observation.actorWallet.toLowerCase(), alice);
    assert.equal(firstPeers[0]?.observation.actorTokenId, 1n);
    assert.equal(firstPeers[0]?.observation.peerWallet.toLowerCase(), bob);
    assert.equal(firstPeers[0]?.observation.peerTokenId, 2n);
    assert.equal(firstPeers[0]?.observation.blockNumber, 11n);

    head = 13n;
    await runtime.syncRegistryAndIndexer();
    await runtime.processFinalizedBlocks();
    await runtime.persistEpochs();

    assert.equal(store.lastProcessedBlock(), 12n);
    const second = store.pendingEpochs().filter((epoch) => epoch.summary.fromBlock === 12n);
    assert.equal(second.length, 2);
    for (const epoch of second) {
      assert.equal(epoch.summary.categoryCounters[ActivityCategory.UNIQUE_COUNTERPARTY], 0);
      assert.equal(epoch.summary.categoryCounters[ActivityCategory.REGISTERED_PEER_CONTACT], 1);
    }

    const allPeers = store.pendingPeerEncounters();
    assert.equal(allPeers.length, 2);
    assert.deepEqual(allPeers.map((item) => item.observation.blockNumber), [11n, 12n]);
    assert.notEqual(
      allPeers[0]?.observation.encounterDigest,
      allPeers[1]?.observation.encounterDigest,
    );

    assert.deepEqual([...store.counterpartiesForWallet(alice)], [bob]);
    assert.deepEqual([...store.counterpartiesForWallet(bob)], [alice]);
    store.close();
  });

  it("does not advance the block cursor when persistence fails", async () => {
    const store = new DaemonStore(":memory:");
    const dependencies: RuntimeDependencies = {
      store,
      chainId: 31337n,
      deploymentBlock: 10n,
      finalityDepth: 1n,
      epochBlocks: 10n,
      highGasThreshold: 100_000n,
      async getHeadBlock() { return 12n; },
      async getBornEvents() { return []; },
      async getIndexedEvents() { return []; },
      async getBlocks() { return [block(10n), block(11n)]; },
      async destinationHasCode() { return false; },
      async submitPending() {},
      async getLifeCandidates() { return []; },
      async sendLifeTick() {},
      async now() { return 0n; },
    };
    const runtime = new RuntimePhases(dependencies);
    await runtime.syncRegistryAndIndexer();
    await runtime.processFinalizedBlocks();

    const original = store.recordProcessedBlock.bind(store);
    let calls = 0;
    store.recordProcessedBlock = ((...args: Parameters<typeof original>) => {
      calls += 1;
      if (calls === 2) throw new Error("synthetic commit failure");
      return original(...args);
    }) as typeof store.recordProcessedBlock;

    await assert.rejects(runtime.persistEpochs(), /synthetic commit failure/);
    assert.equal(store.lastProcessedBlock(), 0n);
    assert.deepEqual(store.pendingPeerEncounters(), []);
    store.close();
  });
});
