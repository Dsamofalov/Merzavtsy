import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeEventLog, keccak256, parseAbi, stringToBytes, type Log } from "viem";
import { network } from "hardhat";

const { viem, networkHelpers } = await network.create();

const semanticAbi = parseAbi([
  "event MemoryRecorded(uint256 indexed actorTokenId,uint256 indexed targetTokenId,uint8 indexed kind,uint32 interactionCount)",
  "event RelationshipMilestone(uint256 indexed actorTokenId,uint256 indexed targetTokenId,uint256 indexed milestoneBit,uint256 fullMask)",
]);

async function fixture() {
  const [admin, alice, bob, keeper] = await viem.getWalletClients();
  const identity = await viem.deployContract("Merzavets", [admin.account.address]);
  const world = await viem.deployContract("MerzavetsWorld", [identity.address, admin.account.address]);
  await identity.write.setWorld([world.address], { account: admin.account });
  await world.write.setOracle([admin.account.address], { account: admin.account });
  await identity.write.birth({ account: alice.account });
  await identity.write.birth({ account: bob.account });
  return { admin, alice, bob, keeper, identity, world };
}

async function decodedEvents(hash: `0x${string}`, worldAddress: `0x${string}`) {
  const publicClient = await viem.getPublicClient();
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const result: Array<{ eventName: string; args: Record<string, unknown> }> = [];
  for (const log of receipt.logs as Log[]) {
    if (log.address.toLowerCase() !== worldAddress.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: semanticAbi, data: log.data, topics: log.topics });
      result.push({ eventName: decoded.eventName, args: decoded.args as Record<string, unknown> });
    } catch {
      // Other world events are intentionally ignored by this semantic-event test.
    }
  }
  return result;
}

function kinds(events: Awaited<ReturnType<typeof decodedEvents>>) {
  return events
    .filter((event) => event.eventName === "MemoryRecorded")
    .map((event) => Number(event.args.kind));
}

describe("canonical memory semantics", () => {
  it("exposes stable semantic kind IDs for indexers", async () => {
    const { world } = await networkHelpers.loadFixture(fixture);
    assert.equal(await world.read.MEMORY_MET(), 0);
    assert.equal(await world.read.MEMORY_HELPED(), 1);
    assert.equal(await world.read.MEMORY_MOCKED(), 2);
    assert.equal(await world.read.MEMORY_BETRAYED(), 3);
    assert.equal(await world.read.MEMORY_FRIENDSHIP_THRESHOLD(), 4);
    assert.equal(await world.read.MEMORY_RIVALRY_THRESHOLD(), 5);
  });

  it("records MET for verified registered-peer contact and action semantics for HELP/MOCK", async () => {
    const { admin, alice, world } = await networkHelpers.loadFixture(fixture);
    const metHash = await world.write.applyVerifiedPeerContact(
      [1n, 2n, keccak256(stringToBytes("semantic-peer"))],
      { account: admin.account },
    );
    assert.deepEqual(kinds(await decodedEvents(metHash, world.address)), [0]);

    await networkHelpers.time.increase(6 * 60 * 60 + 1);
    const helpHash = await world.write.socialize([1n, 2n, 2], { account: alice.account });
    assert.ok(kinds(await decodedEvents(helpHash, world.address)).includes(1));

    await networkHelpers.time.increase(6 * 60 * 60 + 1);
    const mockHash = await world.write.socialize([1n, 2n, 1], { account: alice.account });
    assert.ok(kinds(await decodedEvents(mockHash, world.address)).includes(2));
  });

  it("records friendship threshold and betrayal exactly once while preserving RelationshipMilestone", async () => {
    const { alice, world } = await networkHelpers.loadFixture(fixture);
    let friendshipSemantic = 0;
    let friendshipMilestones = 0;

    for (let i = 0; i < 5; i += 1) {
      if (i > 0) await networkHelpers.time.increase(6 * 60 * 60 + 1);
      const hash = await world.write.socialize([1n, 2n, 2], { account: alice.account });
      const events = await decodedEvents(hash, world.address);
      friendshipSemantic += kinds(events).filter((kind) => kind === 4).length;
      friendshipMilestones += events.filter((event) => event.eventName === "RelationshipMilestone").length;
    }
    assert.equal(friendshipSemantic, 1);
    assert.ok(friendshipMilestones >= 1, "threshold transition must still emit RelationshipMilestone");

    let betrayed = 0;
    for (let i = 0; i < 2; i += 1) {
      await networkHelpers.time.increase(6 * 60 * 60 + 1);
      const hash = await world.write.socialize([1n, 2n, 3], { account: alice.account });
      betrayed += kinds(await decodedEvents(hash, world.address)).filter((kind) => kind === 3).length;
    }
    assert.equal(betrayed, 1);
  });

  it("records rivalry threshold exactly once", async () => {
    const { alice, world } = await networkHelpers.loadFixture(fixture);
    let rivalrySemantic = 0;
    let relationshipMilestones = 0;
    for (let i = 0; i < 8; i += 1) {
      if (i > 0) await networkHelpers.time.increase(6 * 60 * 60 + 1);
      const hash = await world.write.socialize([1n, 2n, 1], { account: alice.account });
      const events = await decodedEvents(hash, world.address);
      rivalrySemantic += kinds(events).filter((kind) => kind === 5).length;
      relationshipMilestones += events.filter((event) => event.eventName === "RelationshipMilestone").length;
    }
    assert.equal(rivalrySemantic, 1);
    assert.ok(relationshipMilestones >= 1);
  });
});
