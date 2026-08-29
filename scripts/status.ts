import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  createPublicClient,
  defineChain,
  http,
  type Address,
} from "viem";
import { IDENTITY_ABI, ORACLE_ABI, WORLD_ABI } from "../daemon/src/contract-abis.js";
import { parseDeploymentMetadata, type DeploymentMetadata } from "../daemon/src/deployment.js";

export interface StatusDriver {
  getChainId(): Promise<bigint>;
  hasCode(address: Address): Promise<boolean>;
  readIdentityWorld(): Promise<Address>;
  readWorldOracle(): Promise<Address>;
  readOracleIdentity(): Promise<Address>;
  readOracleWorld(): Promise<Address>;
  headBlock(): Promise<bigint>;
}

export interface DeploymentStatus {
  healthy: boolean;
  chainId: bigint;
  headBlock: bigint;
  deploymentBlock: bigint;
  identityAddress: Address;
  worldAddress: Address;
  oracleAddress: Address;
  deployedAt: string;
  problems: string[];
}

export async function collectStatus(
  deployment: DeploymentMetadata,
  driver: StatusDriver,
): Promise<DeploymentStatus> {
  const problems: string[] = [];
  const connectedChain = await driver.getChainId();
  if (connectedChain !== deployment.chainId) {
    problems.push(`chainId mismatch: expected ${deployment.chainId}, got ${connectedChain}`);
  }

  const [identityCode, worldCode, oracleCode] = await Promise.all([
    driver.hasCode(deployment.identityAddress),
    driver.hasCode(deployment.worldAddress),
    driver.hasCode(deployment.oracleAddress),
  ]);
  if (!identityCode) problems.push(`no bytecode at identity ${deployment.identityAddress}`);
  if (!worldCode) problems.push(`no bytecode at world ${deployment.worldAddress}`);
  if (!oracleCode) problems.push(`no bytecode at oracle ${deployment.oracleAddress}`);

  const [identityWorld, worldOracle, oracleIdentity, oracleWorld, headBlock] = await Promise.all([
    driver.readIdentityWorld(),
    driver.readWorldOracle(),
    driver.readOracleIdentity(),
    driver.readOracleWorld(),
    driver.headBlock(),
  ]);
  if (identityWorld.toLowerCase() !== deployment.worldAddress.toLowerCase()) {
    problems.push(`identity.world mismatch: expected ${deployment.worldAddress}, got ${identityWorld}`);
  }
  if (worldOracle.toLowerCase() !== deployment.oracleAddress.toLowerCase()) {
    problems.push(`world.oracle mismatch: expected ${deployment.oracleAddress}, got ${worldOracle}`);
  }
  if (oracleIdentity.toLowerCase() !== deployment.identityAddress.toLowerCase()) {
    problems.push(`oracle.identity mismatch: expected ${deployment.identityAddress}, got ${oracleIdentity}`);
  }
  if (oracleWorld.toLowerCase() !== deployment.worldAddress.toLowerCase()) {
    problems.push(`oracle.world mismatch: expected ${deployment.worldAddress}, got ${oracleWorld}`);
  }

  return {
    healthy: problems.length === 0,
    chainId: connectedChain,
    headBlock,
    deploymentBlock: deployment.deploymentBlock,
    identityAddress: deployment.identityAddress,
    worldAddress: deployment.worldAddress,
    oracleAddress: deployment.oracleAddress,
    deployedAt: deployment.deployedAt,
    problems,
  };
}

function positiveChainId(value: string | undefined): bigint {
  if (value === undefined || !/^[0-9]+$/.test(value)) throw new Error("CHAIN_ID is required and must be a positive integer");
  const chainId = BigInt(value);
  if (chainId <= 0n) throw new Error("CHAIN_ID must be positive");
  return chainId;
}

function rpcUrl(value: string | undefined): string {
  if (value === undefined || value.length === 0) throw new Error("RPC_URL is required");
  try { new URL(value); } catch { throw new Error("RPC_URL must be a valid URL"); }
  return value;
}

export async function runStatusCli(env: NodeJS.ProcessEnv = process.env): Promise<DeploymentStatus> {
  const chainId = positiveChainId(env.CHAIN_ID);
  const url = rpcUrl(env.RPC_URL);
  const deployment = parseDeploymentMetadata(
    await readFile(`deployments/${chainId}.json`, "utf8"),
  );
  if (deployment.chainId !== chainId) {
    throw new Error(`deployment file chain mismatch: expected ${chainId}, got ${deployment.chainId}`);
  }
  if (chainId > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("CHAIN_ID exceeds viem safe integer range");

  const chain = defineChain({
    id: Number(chainId),
    name: `Merzavtsy status ${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [url] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(url) });
  const readAddress = async (address: Address, abi: readonly unknown[], functionName: string): Promise<Address> => {
    const value = await publicClient.readContract({ address, abi, functionName } as never);
    if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
      throw new Error(`${functionName} returned invalid address data`);
    }
    return value as Address;
  };

  const status = await collectStatus(deployment, {
    async getChainId() { return BigInt(await publicClient.getChainId()); },
    async hasCode(address) {
      const code = await publicClient.getBytecode({ address });
      return code !== undefined && code !== "0x";
    },
    readIdentityWorld: () => readAddress(deployment.identityAddress, IDENTITY_ABI, "world"),
    readWorldOracle: () => readAddress(deployment.worldAddress, WORLD_ABI, "oracle"),
    readOracleIdentity: () => readAddress(deployment.oracleAddress, ORACLE_ABI, "identity"),
    readOracleWorld: () => readAddress(deployment.oracleAddress, ORACLE_ABI, "world"),
    headBlock: () => publicClient.getBlockNumber(),
  });

  const printable = {
    ...status,
    chainId: status.chainId.toString(),
    headBlock: status.headBlock.toString(),
    deploymentBlock: status.deploymentBlock.toString(),
  };
  console.log(JSON.stringify(printable, null, 2));
  if (!status.healthy) process.exitCode = 2;
  return status;
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && pathToFileURL(entry).href === import.meta.url;
}

if (isDirectExecution()) {
  runStatusCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown status error";
    console.error(`Merzavtsy status failed: ${message}`);
    process.exitCode = 1;
  });
}
