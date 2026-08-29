import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import type { Address, Hex } from "viem";
import { ensureBirth, type BirthDriver } from "../../scripts/birth.js";
import { collectCreatureState } from "../../scripts/show-state.js";
import { collectRelationship } from "../../scripts/show-relationship.js";

const account = "0x1111111111111111111111111111111111111111" as Address;
const txHash = `0x${"ab".repeat(32)}` as Hex;

describe("operator CLI workflows", () => {
  it("birth is idempotent and never broadcasts when the account already owns a creature", async () => {
    let broadcasts = 0;
    const driver: BirthDriver = {
      chainId: async () => 11155111n,
      tokenOf: async () => 7n,
      sendBirth: async () => { broadcasts += 1; return txHash; },
      waitForReceipt: async () => "success",
    };

    const result = await ensureBirth({ expectedChainId: 11155111n, account, driver });

    assert.deepEqual(result, { created: false, tokenId: 7n });
    assert.equal(broadcasts, 0);
  });

  it("birth waits for success and confirms the minted token from chain state", async () => {
    let reads = 0;
    const driver: BirthDriver = {
      chainId: async () => 11155111n,
      tokenOf: async () => (++reads === 1 ? 0n : 9n),
      sendBirth: async () => txHash,
      waitForReceipt: async (hash) => {
        assert.equal(hash, txHash);
        return "success";
      },
    };

    const result = await ensureBirth({ expectedChainId: 11155111n, account, driver });

    assert.deepEqual(result, { created: true, tokenId: 9n, txHash });
  });

  it("birth fails closed on chain mismatch or reverted transaction", async () => {
    const mismatch: BirthDriver = {
      chainId: async () => 1n,
      tokenOf: async () => 0n,
      sendBirth: async () => txHash,
      waitForReceipt: async () => "success",
    };
    await assert.rejects(
      ensureBirth({ expectedChainId: 11155111n, account, driver: mismatch }),
      /chainId mismatch/,
    );

    const reverted: BirthDriver = {
      chainId: async () => 11155111n,
      tokenOf: async () => 0n,
      sendBirth: async () => txHash,
      waitForReceipt: async () => "reverted",
    };
    await assert.rejects(
      ensureBirth({ expectedChainId: 11155111n, account, driver: reverted }),
      /birth transaction reverted/,
    );
  });

  it("show-state returns the complete bounded creature snapshot without mutation", async () => {
    const state = {
      xp: 1234n,
      level: 4,
      lastActivityAt: 100n,
      lastLifeTickAt: 90n,
      stage: 2,
      hibernating: false,
      aggression: 1000,
      curiosity: 2000,
      sociability: 3000,
      greed: 4000,
      stability: 5000,
      chaos: 6000,
      adaptability: 7000,
      memoryBias: 8000,
      energy: 9000,
      mood: 5000,
      boredom: 1000,
      stress: 2000,
      socialNeed: 3000,
    } as const;
    let calls = 0;

    const result = await collectCreatureState(5n, {
      stateOf: async (tokenId) => {
        calls += 1;
        assert.equal(tokenId, 5n);
        return state;
      },
    });

    assert.deepEqual(result, { tokenId: 5n, ...state });
    assert.equal(calls, 1);
  });

  it("show-relationship preserves direction and returns every relationship field", async () => {
    const relationship = {
      affinity: -100,
      trust: 250,
      fear: 10,
      respect: 20,
      envy: 30,
      rivalry: 40,
      interactionCount: 3,
      lastInteractionAt: 123n,
    } as const;

    const result = await collectRelationship(4n, 8n, {
      relationshipOf: async (actorTokenId, targetTokenId) => {
        assert.equal(actorTokenId, 4n);
        assert.equal(targetTokenId, 8n);
        return relationship;
      },
    });

    assert.deepEqual(result, { actorTokenId: 4n, targetTokenId: 8n, ...relationship });
  });

  it("package scripts expose all operator commands and env example documents the birth key", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { scripts?: Record<string, string> };
    assert.equal(packageJson.scripts?.birth, "node --import tsx scripts/birth.ts");
    assert.equal(packageJson.scripts?.["show:state"], "node --import tsx scripts/show-state.ts");
    assert.equal(packageJson.scripts?.["show:relationship"], "node --import tsx scripts/show-relationship.ts");

    const envExample = await readFile(".env.example", "utf8");
    assert.match(envExample, /BIRTH_PRIVATE_KEY=0x<64-hex-birth-private-key>/);
  });
});
