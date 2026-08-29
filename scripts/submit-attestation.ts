import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ORACLE_ABI } from "../daemon/src/contract-abis.js";
import { parseDeploymentMetadata } from "../daemon/src/deployment.js";
import type { ActivityAttestation } from "../daemon/src/attestation.js";
import {
  parseSignedAttestationEnvelope,
  type SignedAttestationEnvelope,
} from "./sign-attestation.js";

export interface ManualSubmitDriver {
  chainId(): Promise<bigint>;
  isEpochConsumed(tokenId: bigint, epochId: Hex): Promise<boolean>;
  broadcast(attestation: ActivityAttestation, signature: Hex): Promise<Hex>;
  waitForReceipt(txHash: Hex): Promise<"success" | "reverted">;
}

export type ManualSubmitResult =
  | { status: "already-consumed" }
  | { status: "submitted"; txHash: Hex };

export async function submitManualAttestation(options: {
  expectedChainId: bigint;
  expectedOracleAddress: Address;
  envelope: SignedAttestationEnvelope;
  driver: ManualSubmitDriver;
}): Promise<ManualSubmitResult> {
  if (options.envelope.attestation.chainId !== options.expectedChainId) {
    throw new Error(
      `attestation chainId mismatch: expected ${options.expectedChainId}, got ${options.envelope.attestation.chainId}`,
    );
  }
  if (
    options.envelope.oracleAddress.toLowerCase()
    !== options.expectedOracleAddress.toLowerCase()
  ) {
    throw new Error(
      `oracle address mismatch: expected ${options.expectedOracleAddress}, got ${options.envelope.oracleAddress}`,
    );
  }

  const connectedChain = await options.driver.chainId();
  if (connectedChain !== options.expectedChainId) {
    throw new Error(
      `chainId mismatch: expected ${options.expectedChainId}, got ${connectedChain}`,
    );
  }

  if (
    await options.driver.isEpochConsumed(
      options.envelope.attestation.tokenId,
      options.envelope.attestation.epochId,
    )
  ) {
    return { status: "already-consumed" };
  }

  const txHash = await options.driver.broadcast(
    options.envelope.attestation,
    options.envelope.signature,
  );
  const receipt = await options.driver.waitForReceipt(txHash);
  if (receipt !== "success") throw new Error("attestation transaction reverted");
  return { status: "submitted", txHash };
}

function positiveChainId(value: string | undefined): bigint {
  if (value === undefined || !/^[0-9]+$/.test(value)) {
    throw new Error("CHAIN_ID is required and must be a positive integer");
  }
  const chainId = BigInt(value);
  if (chainId <= 0n) throw new Error("CHAIN_ID must be positive");
  return chainId;
}

function rpcUrl(value: string | undefined): string {
  if (value === undefined || value.length === 0) throw new Error("RPC_URL is required");
  try {
    new URL(value);
  } catch {
    throw new Error("RPC_URL must be a valid URL");
  }
  return value;
}

function privateKey(value: string | undefined): Hex {
  if (value === undefined || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("SUBMITTER_PRIVATE_KEY must be a 32-byte hex private key");
  }
  return value as Hex;
}

function inputPath(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error("usage: npm run submit:attestation -- <signed-attestation.json>");
  }
  return value;
}

export async function runSubmitAttestationCli(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv.slice(2),
): Promise<ManualSubmitResult> {
  const chainId = positiveChainId(env.CHAIN_ID);
  const url = rpcUrl(env.RPC_URL);
  const deployment = parseDeploymentMetadata(
    await readFile(`deployments/${chainId}.json`, "utf8"),
  );
  if (deployment.chainId !== chainId) {
    throw new Error(
      `deployment file chain mismatch: expected ${chainId}, got ${deployment.chainId}`,
    );
  }
  if (chainId > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("CHAIN_ID exceeds viem safe integer range");
  }

  const envelope = parseSignedAttestationEnvelope(
    await readFile(inputPath(argv[0]), "utf8"),
  );

  const chain = defineChain({
    id: Number(chainId),
    name: `Merzavtsy submitter ${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [url] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(url) });
  const account = privateKeyToAccount(privateKey(env.SUBMITTER_PRIVATE_KEY));
  const walletClient = createWalletClient({ account, chain, transport: http(url) });

  const result = await submitManualAttestation({
    expectedChainId: chainId,
    expectedOracleAddress: deployment.oracleAddress,
    envelope,
    driver: {
      async chainId() {
        return BigInt(await publicClient.getChainId());
      },
      async isEpochConsumed(tokenId, epochId) {
        return publicClient.readContract({
          address: deployment.oracleAddress,
          abi: ORACLE_ABI,
          functionName: "processedEpoch",
          args: [tokenId, epochId],
        });
      },
      async broadcast(attestation, signature) {
        return walletClient.writeContract({
          address: deployment.oracleAddress,
          abi: ORACLE_ABI,
          functionName: "submit",
          args: [attestation, signature],
          account,
        });
      },
      async waitForReceipt(hash) {
        return (await publicClient.waitForTransactionReceipt({ hash })).status;
      },
    },
  });

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && pathToFileURL(entry).href === import.meta.url;
}

if (isDirectExecution()) {
  runSubmitAttestationCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown submission error";
    console.error(`Merzavtsy attestation submission failed: ${message}`);
    process.exitCode = 1;
  });
}
