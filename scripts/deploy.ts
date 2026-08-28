import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isAddress,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { DeploymentMetadata } from "../daemon/src/deployment.js";

export interface DeploymentResult {
  address: Address;
  blockNumber: bigint;
  txHash: Hex;
}

export interface DeploymentDriver {
  chainId(): Promise<bigint>;
  deployerAddress(): Promise<Address>;
  deployerBalance(): Promise<bigint>;
  deploy(contract: string, args: readonly unknown[]): Promise<DeploymentResult>;
  write(address: Address, functionName: string, args: readonly unknown[]): Promise<Hex>;
}

export interface RunDeploymentOptions {
  chainId: bigint;
  oracleSigner: Address;
  allowMainnet: boolean;
  driver: DeploymentDriver;
  now(): Date;
  writeText(path: string, content: string): Promise<void>;
  log(message: string): void;
}

export interface DeploymentCliConfig {
  rpcUrl: string;
  chainId: bigint;
  deployerPrivateKey: Hex;
  oracleSigner: Address;
  allowMainnet: boolean;
}

function requirePositiveBigInt(value: string | undefined, name: string): bigint {
  if (value === undefined || !/^[0-9]+$/.test(value)) throw new Error(`${name} is required and must be a positive integer`);
  const parsed = BigInt(value);
  if (parsed <= 0n) throw new Error(`${name} must be positive`);
  return parsed;
}

function privateKey(value: string | undefined, name: string): Hex {
  if (value === undefined || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be a 32-byte hex private key`);
  }
  return value as Hex;
}

function nonZeroAddress(value: string | undefined, name: string): Address {
  if (value === undefined || !isAddress(value, { strict: false }) || /^0x0{40}$/i.test(value)) {
    throw new Error(`${name} must be a non-zero Ethereum address`);
  }
  return value as Address;
}

export function loadDeploymentCliConfig(env: NodeJS.ProcessEnv): DeploymentCliConfig {
  const rpcUrl = env.RPC_URL;
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error("RPC_URL is required");
  try {
    new URL(rpcUrl);
  } catch {
    throw new Error("RPC_URL must be a valid URL");
  }

  const deployerPrivateKey = privateKey(env.DEPLOYER_PRIVATE_KEY, "DEPLOYER_PRIVATE_KEY");
  const oracleSigner = env.ORACLE_SIGNER_ADDRESS
    ? nonZeroAddress(env.ORACLE_SIGNER_ADDRESS, "ORACLE_SIGNER_ADDRESS")
    : privateKeyToAccount(privateKey(env.ORACLE_PRIVATE_KEY, "ORACLE_PRIVATE_KEY")).address;

  return {
    rpcUrl,
    chainId: requirePositiveBigInt(env.CHAIN_ID, "CHAIN_ID"),
    deployerPrivateKey,
    oracleSigner,
    allowMainnet: env.ALLOW_MAINNET_DEPLOY === "true",
  };
}

/**
 * Dependency-ordered deployment with an early mainnet kill switch. The first
 * identity deployment block becomes the daemon's conservative indexing start.
 */
export async function runDeployment(options: RunDeploymentOptions): Promise<DeploymentMetadata> {
  if (options.chainId <= 0n) throw new Error("chainId must be positive");
  if (options.chainId === 1n && !options.allowMainnet) {
    throw new Error("Ethereum mainnet deployment requires ALLOW_MAINNET_DEPLOY=true");
  }
  if (!isAddress(options.oracleSigner, { strict: false }) || /^0x0{40}$/i.test(options.oracleSigner)) {
    throw new Error("oracleSigner must be a non-zero Ethereum address");
  }

  const connectedChain = await options.driver.chainId();
  if (connectedChain !== options.chainId) {
    throw new Error(`connected chain mismatch: expected ${options.chainId}, got ${connectedChain}`);
  }
  const deployer = await options.driver.deployerAddress();
  const balance = await options.driver.deployerBalance();
  options.log(`chainId=${options.chainId}`);
  options.log(`deployer=${deployer}`);
  options.log(`deployerBalanceWei=${balance}`);

  const identity = await options.driver.deploy("Merzavets", [deployer]);
  const world = await options.driver.deploy("MerzavetsWorld", [identity.address, deployer]);
  await options.driver.write(identity.address, "setWorld", [world.address]);
  const oracle = await options.driver.deploy("ActivityOracle", [
    world.address,
    identity.address,
    deployer,
    options.oracleSigner,
  ]);
  await options.driver.write(world.address, "setOracle", [oracle.address]);

  const metadata: DeploymentMetadata = {
    chainId: options.chainId,
    identityAddress: identity.address,
    worldAddress: world.address,
    oracleAddress: oracle.address,
    deploymentBlock: identity.blockNumber,
    deployedAt: options.now().toISOString(),
  };
  const path = `deployments/${options.chainId}.json`;
  await options.writeText(
    path,
    `${JSON.stringify({
      chainId: metadata.chainId.toString(),
      identityAddress: metadata.identityAddress,
      worldAddress: metadata.worldAddress,
      oracleAddress: metadata.oracleAddress,
      deploymentBlock: metadata.deploymentBlock.toString(),
      deployedAt: metadata.deployedAt,
    }, null, 2)}\n`,
  );
  options.log(`identity=${identity.address}`);
  options.log(`world=${world.address}`);
  options.log(`oracle=${oracle.address}`);
  options.log(`deploymentFile=${path}`);
  return metadata;
}

interface Artifact {
  abi: Abi;
  bytecode: Hex;
}

const ARTIFACT_PATHS: Record<string, string> = {
  Merzavets: "artifacts/contracts/Merzavets.sol/Merzavets.json",
  MerzavetsWorld: "artifacts/contracts/MerzavetsWorld.sol/MerzavetsWorld.json",
  ActivityOracle: "artifacts/contracts/ActivityOracle.sol/ActivityOracle.json",
};

async function loadArtifact(contract: string): Promise<Artifact> {
  const path = ARTIFACT_PATHS[contract];
  if (path === undefined) throw new Error(`unknown deployment contract ${contract}`);
  const raw = JSON.parse(await readFile(path, "utf8")) as { abi?: unknown; bytecode?: unknown };
  if (!Array.isArray(raw.abi) || typeof raw.bytecode !== "string" || !/^0x[0-9a-fA-F]+$/.test(raw.bytecode)) {
    throw new Error(`invalid Hardhat artifact for ${contract}; run npm run compile first`);
  }
  return { abi: raw.abi as Abi, bytecode: raw.bytecode as Hex };
}

export async function createDefaultDeploymentDriver(config: DeploymentCliConfig): Promise<DeploymentDriver> {
  if (config.chainId > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("CHAIN_ID exceeds viem safe integer range");
  const account = privateKeyToAccount(config.deployerPrivateKey);
  const chain = defineChain({
    id: Number(config.chainId),
    name: `Merzavtsy deploy ${config.chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(config.rpcUrl) });
  const abiByAddress = new Map<string, Abi>();

  return {
    async chainId() {
      return BigInt(await publicClient.getChainId());
    },
    async deployerAddress() {
      return account.address;
    },
    async deployerBalance() {
      return publicClient.getBalance({ address: account.address });
    },
    async deploy(contract, args) {
      const artifact = await loadArtifact(contract);
      const hash = await walletClient.deployContract({
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        args,
      } as never);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const contractAddress = receipt.contractAddress;
      if (receipt.status !== "success" || contractAddress == null) {
        throw new Error(`${contract} deployment reverted or returned no contract address`);
      }
      abiByAddress.set(contractAddress.toLowerCase(), artifact.abi);
      return { address: contractAddress, blockNumber: receipt.blockNumber, txHash: hash };
    },
    async write(address, functionName, args) {
      const abi = abiByAddress.get(address.toLowerCase());
      if (abi === undefined) throw new Error(`no deployed ABI registered for ${address}`);
      const hash = await walletClient.writeContract({ address, abi, functionName, args } as never);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`${functionName} transaction reverted`);
      return hash;
    },
  };
}

export async function runDeploymentCli(env: NodeJS.ProcessEnv = process.env): Promise<DeploymentMetadata> {
  const config = loadDeploymentCliConfig(env);
  // Mainnet guard is repeated here before even constructing an RPC client.
  if (config.chainId === 1n && !config.allowMainnet) {
    throw new Error("Ethereum mainnet deployment requires ALLOW_MAINNET_DEPLOY=true");
  }
  const driver = await createDefaultDeploymentDriver(config);
  return runDeployment({
    chainId: config.chainId,
    oracleSigner: config.oracleSigner,
    allowMainnet: config.allowMainnet,
    driver,
    now: () => new Date(),
    async writeText(path, content) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf8");
    },
    log: (message) => console.log(message),
  });
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && pathToFileURL(entry).href === import.meta.url;
}

if (isDirectExecution()) {
  runDeploymentCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown deployment error";
    // Config validation errors contain field names only; never print key values.
    console.error(`Merzavtsy deployment failed: ${message}`);
    process.exitCode = 1;
  });
}
