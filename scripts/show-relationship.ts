import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createPublicClient, defineChain, http } from "viem";
import { WORLD_ABI } from "../daemon/src/contract-abis.js";
import { parseDeploymentMetadata } from "../daemon/src/deployment.js";

export interface RelationshipSnapshot {
  affinity: number;
  trust: number;
  fear: number;
  respect: number;
  envy: number;
  rivalry: number;
  interactionCount: number;
  lastInteractionAt: bigint;
}

export interface RelationshipDriver {
  relationshipOf(actorTokenId: bigint, targetTokenId: bigint): Promise<RelationshipSnapshot>;
}

export async function collectRelationship(
  actorTokenId: bigint,
  targetTokenId: bigint,
  driver: RelationshipDriver,
) {
  if (actorTokenId <= 0n || targetTokenId <= 0n) throw new Error("token ids must be positive");
  if (actorTokenId === targetTokenId) throw new Error("actor and target token ids must differ");
  return {
    actorTokenId,
    targetTokenId,
    ...(await driver.relationshipOf(actorTokenId, targetTokenId)),
  };
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

export async function runShowRelationshipCli(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv.slice(2),
) {
  const chainId = positiveInteger(env.CHAIN_ID, "CHAIN_ID");
  const actorTokenId = positiveInteger(argv[0], "actorTokenId");
  const targetTokenId = positiveInteger(argv[1], "targetTokenId");
  const url = rpcUrl(env.RPC_URL);
  const deployment = parseDeploymentMetadata(await readFile(`deployments/${chainId}.json`, "utf8"));
  if (deployment.chainId !== chainId) {
    throw new Error(`deployment file chain mismatch: expected ${chainId}, got ${deployment.chainId}`);
  }
  if (chainId > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("CHAIN_ID exceeds viem safe integer range");

  const chain = defineChain({
    id: Number(chainId),
    name: `Merzavtsy relationship ${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [url] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(url) });
  const connectedChain = BigInt(await publicClient.getChainId());
  if (connectedChain !== chainId) throw new Error(`chainId mismatch: expected ${chainId}, got ${connectedChain}`);

  const result = await collectRelationship(actorTokenId, targetTokenId, {
    async relationshipOf(actor, target) {
      return publicClient.readContract({
        address: deployment.worldAddress,
        abi: WORLD_ABI,
        functionName: "relationshipOf",
        args: [actor, target],
      }) as Promise<RelationshipSnapshot>;
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
  runShowRelationshipCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown relationship error";
    console.error(`Merzavtsy show-relationship failed: ${message}`);
    process.exitCode = 1;
  });
}
