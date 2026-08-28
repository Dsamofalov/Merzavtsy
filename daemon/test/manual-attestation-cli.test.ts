import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { recoverTypedDataAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ACTIVITY_TYPES, activityDomain } from "../src/attestation.js";
import type { EpochSummary } from "../src/types.js";
import {
  buildManualSignedAttestation,
  parseSignedAttestationEnvelope,
  serializeSignedAttestationEnvelope,
  type ManualSignDriver,
} from "../../scripts/sign-attestation.js";
import {
  submitManualAttestation,
  type ManualSubmitDriver,
} from "../../scripts/submit-attestation.js";

const oracleKey = `0x${"11".repeat(32)}` as Hex;
const oracleAccount = privateKeyToAccount(oracleKey);
const oracleAddress = "0x3333333333333333333333333333333333333333" as Address;
const txHash = `0x${"44".repeat(32)}` as Hex;
const summary: EpochSummary = {
  wallet: "0x1111111111111111111111111111111111111111" as Address,
  tokenId: 7n,
  chainId: 11155111n,
  fromBlock: 100n,
  toBlock: 119n,
  epochId: `0x${"aa".repeat(32)}` as Hex,
  activityDigest: `0x${"bb".repeat(32)}` as Hex,
  xpDelta: 321n,
  personalityDeltas: [1, -2, 3, -4, 5, -6, 7, -8],
  needDeltas: [-9, 10, -11, 12, -13],
  categoryCounters: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
};

describe("manual activity attestation CLI", () => {
  it("builds a recoverable EIP-712 envelope from one durable epoch without broadcasting", async () => {
    let nonceReads = 0;
    const driver: ManualSignDriver = {
      chainId: async () => 11155111n,
      isEpochConsumed: async (tokenId, epochId) => {
        assert.equal(tokenId, 7n);
        assert.equal(epochId, summary.epochId);
        return false;
      },
      activityNonce: async (wallet) => {
        nonceReads += 1;
        assert.equal(wallet, summary.wallet);
        return 5n;
      },
    };

    const envelope = await buildManualSignedAttestation({
      expectedChainId: 11155111n,
      oracleAddress,
      summary,
      signer: oracleAccount,
      now: 1_800_000_000n,
      ttlSeconds: 900n,
      driver,
    });

    assert.equal(nonceReads, 1);
    assert.equal(envelope.oracleAddress, oracleAddress);
    assert.equal(envelope.attestation.nonce, 5n);
    assert.equal(envelope.attestation.deadline, 1_800_000_900n);
    assert.equal(envelope.attestation.epochId, summary.epochId);

    const recovered = await recoverTypedDataAddress({
      domain: activityDomain(11155111n, oracleAddress),
      types: ACTIVITY_TYPES,
      primaryType: "ActivityAttestation",
      message: envelope.attestation,
      signature: envelope.signature,
    });
    assert.equal(recovered.toLowerCase(), oracleAccount.address.toLowerCase());
  });

  it("refuses consumed epochs and chain mismatches before requesting a nonce", async () => {
    let nonceReads = 0;
    const consumed: ManualSignDriver = {
      chainId: async () => 11155111n,
      isEpochConsumed: async () => true,
      activityNonce: async () => { nonceReads += 1; return 0n; },
    };
    await assert.rejects(
      buildManualSignedAttestation({
        expectedChainId: 11155111n,
        oracleAddress,
        summary,
        signer: oracleAccount,
        now: 100n,
        ttlSeconds: 60n,
        driver: consumed,
      }),
      /already consumed/,
    );
    assert.equal(nonceReads, 0);

    const wrongChain: ManualSignDriver = {
      chainId: async () => 1n,
      isEpochConsumed: async () => false,
      activityNonce: async () => { nonceReads += 1; return 0n; },
    };
    await assert.rejects(
      buildManualSignedAttestation({
        expectedChainId: 11155111n,
        oracleAddress,
        summary,
        signer: oracleAccount,
        now: 100n,
        ttlSeconds: 60n,
        driver: wrongChain,
      }),
      /chainId mismatch/,
    );
    assert.equal(nonceReads, 0);
  });

  it("round-trips signed envelopes without bigint or tuple loss", async () => {
    const driver: ManualSignDriver = {
      chainId: async () => 11155111n,
      isEpochConsumed: async () => false,
      activityNonce: async () => 2n,
    };
    const envelope = await buildManualSignedAttestation({
      expectedChainId: 11155111n,
      oracleAddress,
      summary,
      signer: oracleAccount,
      now: 1000n,
      ttlSeconds: 120n,
      driver,
    });

    const encoded = serializeSignedAttestationEnvelope(envelope);
    const decoded = parseSignedAttestationEnvelope(encoded);
    assert.deepEqual(decoded, envelope);
  });

  it("submits the exact signed payload once and waits for a successful receipt", async () => {
    const signDriver: ManualSignDriver = {
      chainId: async () => 11155111n,
      isEpochConsumed: async () => false,
      activityNonce: async () => 3n,
    };
    const envelope = await buildManualSignedAttestation({
      expectedChainId: 11155111n,
      oracleAddress,
      summary,
      signer: oracleAccount,
      now: 1000n,
      ttlSeconds: 120n,
      driver: signDriver,
    });

    let broadcasts = 0;
    const submitDriver: ManualSubmitDriver = {
      chainId: async () => 11155111n,
      isEpochConsumed: async () => false,
      broadcast: async (attestation, signature) => {
        broadcasts += 1;
        assert.deepEqual(attestation, envelope.attestation);
        assert.equal(signature, envelope.signature);
        return txHash;
      },
      waitForReceipt: async (hash) => {
        assert.equal(hash, txHash);
        return "success";
      },
    };

    const result = await submitManualAttestation({
      expectedChainId: 11155111n,
      expectedOracleAddress: oracleAddress,
      envelope,
      driver: submitDriver,
    });
    assert.deepEqual(result, { status: "submitted", txHash });
    assert.equal(broadcasts, 1);
  });

  it("never broadcasts consumed, wrong-chain, wrong-oracle, or reverted envelopes", async () => {
    const signDriver: ManualSignDriver = {
      chainId: async () => 11155111n,
      isEpochConsumed: async () => false,
      activityNonce: async () => 3n,
    };
    const envelope = await buildManualSignedAttestation({
      expectedChainId: 11155111n,
      oracleAddress,
      summary,
      signer: oracleAccount,
      now: 1000n,
      ttlSeconds: 120n,
      driver: signDriver,
    });

    let broadcasts = 0;
    const driver = (overrides: Partial<ManualSubmitDriver> = {}): ManualSubmitDriver => ({
      chainId: async () => 11155111n,
      isEpochConsumed: async () => false,
      broadcast: async () => { broadcasts += 1; return txHash; },
      waitForReceipt: async () => "success",
      ...overrides,
    });

    const already = await submitManualAttestation({
      expectedChainId: 11155111n,
      expectedOracleAddress: oracleAddress,
      envelope,
      driver: driver({ isEpochConsumed: async () => true }),
    });
    assert.deepEqual(already, { status: "already-consumed" });
    assert.equal(broadcasts, 0);

    await assert.rejects(
      submitManualAttestation({
        expectedChainId: 11155111n,
        expectedOracleAddress: oracleAddress,
        envelope,
        driver: driver({ chainId: async () => 1n }),
      }),
      /chainId mismatch/,
    );
    assert.equal(broadcasts, 0);

    await assert.rejects(
      submitManualAttestation({
        expectedChainId: 11155111n,
        expectedOracleAddress: "0x5555555555555555555555555555555555555555" as Address,
        envelope,
        driver: driver(),
      }),
      /oracle address mismatch/,
    );
    assert.equal(broadcasts, 0);

    await assert.rejects(
      submitManualAttestation({
        expectedChainId: 11155111n,
        expectedOracleAddress: oracleAddress,
        envelope,
        driver: driver({ waitForReceipt: async () => "reverted" }),
      }),
      /transaction reverted/,
    );
    assert.equal(broadcasts, 1);
  });

  it("package scripts expose separated manual sign and submit commands", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { scripts?: Record<string, string> };
    assert.equal(packageJson.scripts?.["sign:attestation"], "node --import tsx scripts/sign-attestation.ts");
    assert.equal(packageJson.scripts?.["submit:attestation"], "node --import tsx scripts/submit-attestation.ts");

    const envExample = await readFile(".env.example", "utf8");
    assert.match(envExample, /ORACLE_PRIVATE_KEY=/);
    assert.match(envExample, /SUBMITTER_PRIVATE_KEY=/);
  });
});
