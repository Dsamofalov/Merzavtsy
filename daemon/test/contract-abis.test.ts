import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeEventTopics, encodeFunctionData } from "viem";
import { IDENTITY_ABI, ORACLE_ABI, WORLD_ABI } from "../src/contract-abis.js";

const wallet = "0x1111111111111111111111111111111111111111" as const;
const peer = "0x2222222222222222222222222222222222222222" as const;
const digest = `0x${"aa".repeat(32)}` as const;
const signature = `0x${"55".repeat(65)}` as const;

describe("runtime contract ABIs", () => {
  it("encodes activity and peer attestation entrypoints", () => {
    const activity = encodeFunctionData({
      abi: ORACLE_ABI,
      functionName: "submit",
      args: [{
        wallet,
        tokenId: 1n,
        chainId: 11155111n,
        fromBlock: 10n,
        toBlock: 20n,
        epochId: digest,
        activityDigest: digest,
        xpDelta: 100n,
        personalityDeltas: [0, 0, 0, 0, 0, 0, 0, 0],
        needDeltas: [0, 0, 0, 0, 0],
        categoryCounters: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        nonce: 0n,
        deadline: 2_000_000_000n,
      }, signature],
    });
    assert.ok(activity.startsWith("0x"));

    const peerData = encodeFunctionData({
      abi: ORACLE_ABI,
      functionName: "submitPeer",
      args: [{
        actorWallet: wallet,
        actorTokenId: 1n,
        peerWallet: peer,
        peerTokenId: 2n,
        chainId: 11155111n,
        blockNumber: 20n,
        encounterDigest: digest,
        nonce: 0n,
        deadline: 2_000_000_000n,
      }, signature],
    });
    assert.ok(peerData.startsWith("0x"));
  });

  it("contains the runtime read/write surface and Born event", () => {
    const lifeTick = encodeFunctionData({ abi: WORLD_ABI, functionName: "lifeTick", args: [1n] });
    const stateOf = encodeFunctionData({ abi: WORLD_ABI, functionName: "stateOf", args: [1n] });
    const identityWorld = encodeFunctionData({ abi: IDENTITY_ABI, functionName: "world" });
    const bornTopics = encodeEventTopics({
      abi: IDENTITY_ABI,
      eventName: "Born",
      args: { tokenId: 1n, owner: wallet },
    });

    assert.ok(lifeTick.startsWith("0x"));
    assert.ok(stateOf.startsWith("0x"));
    assert.ok(identityWorld.startsWith("0x"));
    assert.ok(bornTopics[0]?.startsWith("0x"));
  });
});
