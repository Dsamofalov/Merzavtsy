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
import { IDENTITY_ABI } from "../daemon/src/contract-abis.js";
import { parseDeploymentMetadata } from "../daemon/src/deployment.js";

export interface BirthDriver {
  chainId(): Promise<bigint>;
  tokenOf(account: Address): Promise<bigint>;
  sendBirth(): Promise<Hex>;
  waitForReceipt(hash: Hex): Promise<"success" | "reverted">;
}

export interface BirthResult {
  created: boolean;
  tokenId: bigint;
  txHash?: Hex;
}

export async function ensureBirth(options: {
  expectedChainId: bigint;
  account: Address;
  driver: BirthDriver;
}): Promise<BirthResult> {
  const connectedChain = await options.driver.chainId();
  if (connectedChain !== options.expectedChainId) {
    throw new Error(`chainId mismatch: expected ${options.expectedChainId}, got ${connectedChain}`);
  }

  const existing = await options.driver.tokenOf(options.account);
  if (existing !== 0n) return { created: false, tokenId: existing };

  const txHash = await options.driver.sendBirth();
  const receiptStatus = await options.driver.waitForReceipt(txHash);
  if (receiptStatus !== "success") throw new Error("birth transaction reverted");

  const tokenId = await options.driver.tokenOf(options.account);
  if (tokenId === 0n) throw new Error("birth transaction succeeded but tokenOf is still zero");
  return { created: true, tokenId, txHash };
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
  try { new URL(value); } catch { throw new Error("RPC_URL must be a valid URL"); }
  return value;
}

function birthPrivateKey(value: string | undefined): Hex {
  if (value === undefined || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("BIRTH_PRIVATE_KEY must be a 32-byte hex private key");
  }
  return value as Hex;
}

export async function runBirthCli(env: NodeJS.ProcessEnv = process.env): Promise<BirthResult> {
  const chainId = positiveChainId(env.CHAIN_ID);
  const url = rpcUrl(env.RPC_URL);
  const account = privateKeyToAccount(birthPrivateKey(env.BIRTH_PRIVATE_KEY));
  const deployment = parseDeploymentMetadata(await readFile(`deployments/${chainId}.json`, "utf8"));
  if (deployment.chainId !== chainId) {
    throw new Error(`deployment file chain mismatch: expected ${chainId}, got ${deployment.chainId}`);
  }
  if (chainId > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("CHAIN_ID exceeds viem safe integer range");

  const chain = defineChain({
    id: Number(chainId),
    name: `Merzavtsy birth ${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [url] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(url) });
  const walletClient = createWalletClient({ account, chain, transport: http(url) });

  const result = await ensureBirth({
    expectedChainId: chainId,
    account: account.address,
    driver: {
      async chainId() { return BigInt(await publicClient.getChainId()); },
      async tokenOf(owner) {
        return publicClient.readContract({
          address: deployment.identityAddress,
          abi: IDENTITY_ABI,
          functionName: "tokenOf",
          args: [owner],
        });
      },
      async sendBirth() {
        return walletClient.writeContract({
          address: deployment.identityAddress,
          abi: IDENTITY_ABI,
          functionName: "birth",
          account,
        });
      },
      async waitForReceipt(hash) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return receipt.status;
      },
    },
  });

  console.log(JSON.stringify({
    ...result,
    account: account.address,
    chainId: chainId.toString(),
    tokenId: result.tokenId.toString(),
  }, null, 2));
  return result;
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && pathToFileURL(entry).href === import.meta.url;
}

if (isDirectExecution()) {
  runBirthCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown birth error";
    console.error(`Merzavtsy birth failed: ${message}`);
    process.exitCode = 1;
  });
}
