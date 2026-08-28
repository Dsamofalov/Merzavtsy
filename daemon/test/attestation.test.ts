import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recoverTypedDataAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ACTIVITY_TYPES,
  activityDomain,
  buildAttestation,
  signAttestation,
} from "../src/attestation.js";
import type { EpochSummary } from "../src/types.js";

const PRIVATE_KEY = `0x${"11".repeat(32)}` as Hex;
const ORACLE = "0x9000000000000000000000000000000000000009" as Address;
const WALLET = "0x1000000000000000000000000000000000000001" as Address;

function summary(): EpochSummary {
  return {
    wallet: WALLET,
    tokenId: 7n,
    chainId: 31337n,
    fromBlock: 100n,
    toBlock: 120n,
    epochId: `0x${"22".repeat(32)}` as Hex,
    activityDigest: `0x${"33".repeat(32)}` as Hex,
    xpDelta: 321n,
    personalityDeltas: [1, -2, 3, -4, 5, -6, 7, -8],
    needDeltas: [-10, 20, -30, 40, -50],
    categoryCounters: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  };
}

describe("activity attestation signing", () => {
  it("builds the exact Solidity payload fields without mutating the epoch summary", () => {
    const source = summary();
    const attestation = buildAttestation(source, 4n, 1_900_000_000n);

    assert.deepEqual(attestation, {
      wallet: WALLET,
      tokenId: 7n,
      chainId: 31337n,
      fromBlock: 100n,
      toBlock: 120n,
      epochId: source.epochId,
      activityDigest: source.activityDigest,
      xpDelta: 321n,
      personalityDeltas: [1, -2, 3, -4, 5, -6, 7, -8],
      needDeltas: [-10, 20, -30, 40, -50],
      categoryCounters: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      nonce: 4n,
      deadline: 1_900_000_000n,
    });
    assert.equal(source.xpDelta, 321n);
  });

  it("uses the on-chain EIP-712 domain and recovers the configured oracle signer", async () => {
    const account = privateKeyToAccount(PRIVATE_KEY);
    const attestation = buildAttestation(summary(), 0n, 1_900_000_000n);
    const signature = await signAttestation(account, ORACLE, attestation);

    const recovered = await recoverTypedDataAddress({
      domain: activityDomain(attestation.chainId, ORACLE),
      types: ACTIVITY_TYPES,
      primaryType: "ActivityAttestation",
      message: attestation,
      signature,
    });

    assert.equal(recovered.toLowerCase(), account.address.toLowerCase());
    assert.deepEqual(activityDomain(31337n, ORACLE), {
      name: "Merzavtsy Activity Oracle",
      version: "1",
      chainId: 31337n,
      verifyingContract: ORACLE,
    });
  });
});
