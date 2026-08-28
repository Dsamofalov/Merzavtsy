import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createPublicClient, defineChain, http } from "viem";
import { WORLD_ABI } from "../daemon/src/contract-abis.js";
import { parseDeploymentMetadata } from "../daemon/src/deployment.js";

export interface CreatureStateSnapshot {
  xp: bigint;
  level: number;
  lastActivityAt: bigint;
  lastLifeTickAt: bigint;
  stage: number;
  hibernating: boolean;
  aggression: number;
  curiosity: number;
  sociability: number;
  greed: number;
  stability: number;
  chaos: number;
  adaptability: number;
  memoryBias: number;
  energy: number;
  mood: number;
  boredom: number;
  stress: number;
  socialNeed: number;
}

export interface StateDriver {
  stateOf(tokenId: bigint): Promise<CreatureStateSnapshot>;
}

export async function collectCreatureState(tokenId: bigint, driver: StateDriver) {
  if (tokenId <= 0n) throw new Error("tokenId must be positive");
  return { tokenId, ...(await driver.stateOf(tokenId)) };
}

function positiveInteger(value: string | undefined, label: string): bigint {
  if (value === undefined || !/^[0-9]+$/.test(value)) throw new Error(`${label} must be a positive integer`);
  const parsed = BigInt(value);
  if (parsed <= 0n) throw new Error(`${label} must be positive`);
  return parsed;
}

function rpcUrl(value: string | undefined): string {
  if (value === undefined || value.length === 0) throw new Error("RPC_URL is required");
  try { new URL(value); } catch { throw new Error("RPC_URL must be a valid URL"); }
  return value;
}

function bigintJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested) => typeof nested === "bigint" ? nested.toString() : nested, 2);
}

export async function runShowStateCli(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv.slice(2),
) {
  const chainId = positiveInteger(env.CHAIN_ID, "CHAIN_ID");
  const tokenId = positiveInteger(argv[0], "tokenId");
  const url = rpcUrl(env.RPC_URL);
  const deployment = parseDeploymentMetadata(await readFile(`deployments/${chainId}.json`, "utf8"));
  if (deployment.chainId !== chainId) {
    throw new Error(`deployment file chain mismatch: expected ${chainId}, got ${deployment.chainId}`);
  }
  if (chainId > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("CHAIN_ID exceeds viem safe integer range");

  const chain = defineChain({
    id: Number(chainId),
    name: `Merzavtsy state ${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [url] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(url) });
  const connectedChain = BigInt(await publicClient.getChainId());
  if (connectedChain !== chainId) throw new Error(`chainId mismatch: expected ${chainId}, got ${connectedChain}`);

  const result = await collectCreatureState(tokenId, {
    async stateOf(id) {
      return publicClient.readContract({
        address: deployment.worldAddress,
        abi: WORLD_ABI,
        functionName: "stateOf",
        args: [id],
      }) as Promise<CreatureStateSnapshot>;
    },
  });
  console.log(bigintJson({ chainId, ...result }));
  return result;
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && pathToFileURL(entry).href === import.meta.url;
}

if (isDirectExecution()) {
  runShowStateCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown state error";
    console.error(`Merzavtsy show-state failed: ${message}`);
    process.exitCode = 1;
  });
}
