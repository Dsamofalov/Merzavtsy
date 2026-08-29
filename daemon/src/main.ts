import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type LocalAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bindShutdownSignals, runDaemonLoop } from "./app.js";
import type { BootstrapChainState } from "./bootstrap.js";
import { createDaemonApplication, type DaemonRuntimeIo } from "./composition.js";
import { loadConfig, type RuntimeConfig } from "./config.js";
import {
  assertDeploymentMatches,
  parseDeploymentMetadata,
  type DeploymentMetadata,
} from "./deployment.js";
import { errorLogFields, JsonLogger, type Logger } from "./logger.js";
import { ProductionIo } from "./production-io.js";
import { RpcBlockSource } from "./rpc-source.js";
import { deploymentPath, openStoreAfterBootstrap } from "./startup.js";
import { DaemonStore } from "./store.js";
import { createViemProductionAdapter } from "./viem-production.js";
import type { ObservedBlock } from "./types.js";

export interface ProductionRuntimeIo extends DaemonRuntimeIo {
  bootstrapState(): Promise<BootstrapChainState>;
}

export interface ProductionNetwork {
  io: ProductionRuntimeIo;
  oracleSigner: LocalAccount;
  getHeadBlock(): Promise<bigint>;
  getBlocks(fromBlock: bigint, toBlock: bigint): Promise<readonly ObservedBlock[]>;
  destinationHasCode(address: Address, blockNumber: bigint): Promise<boolean>;
}

export interface PrepareProductionDependencies {
  readText(path: string): Promise<string>;
  createNetwork(config: RuntimeConfig): ProductionNetwork;
  openStore(path: string): DaemonStore;
  logger?: Logger;
}

export interface PreparedProductionDaemon {
  config: RuntimeConfig;
  deployment: DeploymentMetadata;
  store: DaemonStore;
  service: ReturnType<typeof createDaemonApplication>["service"];
}

function safeChainId(chainId: bigint): number {
  if (chainId > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("CHAIN_ID is outside the safe viem chain id range");
  }
  return Number(chainId);
}

/**
 * Construct the only real JSON-RPC boundary used by the executable daemon.
 * Oracle signing and transaction submission deliberately use separate keys.
 */
export function createDefaultNetwork(config: RuntimeConfig): ProductionNetwork {
  const id = safeChainId(config.chainId);
  const chain = defineChain({
    id,
    name: `Merzavtsy ${id}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
  const oracleSigner = privateKeyToAccount(config.oraclePrivateKey);
  const submitter = privateKeyToAccount(config.submitterPrivateKey);
  const walletClient = createWalletClient({
    account: submitter,
    chain,
    transport: http(config.rpcUrl),
  });

  // Narrow wrappers keep viem's generic client surface outside the rest of the
  // daemon. Requests are produced only by createViemProductionAdapter.
  const adapter = createViemProductionAdapter({
    addresses: {
      identity: config.identityAddress,
      world: config.worldAddress,
      oracle: config.oracleAddress,
    },
    publicClient: {
      getChainId: () => publicClient.getChainId(),
      getBytecode: (request) => publicClient.getBytecode(request),
      readContract: (request) => publicClient.readContract(request as never) as Promise<unknown>,
      getLogs: (request) => publicClient.getLogs(request as never) as Promise<readonly unknown[]>,
      waitForTransactionReceipt: (request) => publicClient.waitForTransactionReceipt(request),
      getBlock: (request) => publicClient.getBlock(request as never) as Promise<unknown>,
      getTransactionReceipt: (request) => publicClient.getTransactionReceipt(request),
      getBlockNumber: () => publicClient.getBlockNumber(),
    },
    walletClient: {
      writeContract: (request) => walletClient.writeContract(request as never),
    },
  });
  const io = new ProductionIo(
    {
      identity: config.identityAddress,
      world: config.worldAddress,
      oracle: config.oracleAddress,
    },
    adapter.production,
  );
  const blocks = new RpcBlockSource(config.chainId, adapter.blocks, config.epochBlocks);

  return {
    io,
    oracleSigner,
    getHeadBlock: adapter.getHeadBlock,
    getBlocks: (fromBlock, toBlock) => blocks.getBlocks(fromBlock, toBlock),
    destinationHasCode: adapter.destinationHasCode,
  };
}

const DEFAULT_DEPENDENCIES: PrepareProductionDependencies = {
  readText: (path) => readFile(path, "utf8"),
  createNetwork: createDefaultNetwork,
  openStore: (path) => new DaemonStore(path),
};

/**
 * Prepare a production daemon without starting its infinite loop. Deployment
 * metadata is checked before network construction, and live topology is
 * checked before SQLite is opened.
 */
export async function prepareProductionDaemon(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: PrepareProductionDependencies = DEFAULT_DEPENDENCIES,
): Promise<PreparedProductionDaemon> {
  const logger = dependencies.logger ?? new JsonLogger();
  const config = loadConfig(env);
  const metadata = parseDeploymentMetadata(
    await dependencies.readText(deploymentPath(config.chainId)),
  );
  assertDeploymentMatches(metadata, {
    chainId: config.chainId,
    identityAddress: config.identityAddress,
    worldAddress: config.worldAddress,
    oracleAddress: config.oracleAddress,
  });

  const network = dependencies.createNetwork(config);
  const store = await openStoreAfterBootstrap(
    config,
    metadata,
    () => network.io.bootstrapState(),
    () => dependencies.openStore(config.dbPath),
  );

  try {
    const application = createDaemonApplication({
      config,
      deploymentBlock: metadata.deploymentBlock,
      store,
      oracleSigner: network.oracleSigner,
      io: network.io,
      logger,
      getHeadBlock: network.getHeadBlock,
      getBlocks: network.getBlocks,
      destinationHasCode: network.destinationHasCode,
    });
    return { config, deployment: metadata, store, service: application.service };
  } catch (error) {
    store.close();
    throw error;
  }
}

export async function runProductionDaemon(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const prepared = await prepareProductionDaemon(env);
  const controller = new AbortController();
  const detachSignals = bindShutdownSignals(controller, process);
  try {
    await runDaemonLoop(prepared.service, prepared.store, controller.signal);
  } finally {
    detachSignals();
  }
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && pathToFileURL(entry).href === import.meta.url;
}

if (isDirectExecution()) {
  runProductionDaemon().catch((error: unknown) => {
    new JsonLogger().error("daemon_terminated", errorLogFields(error));
    process.exitCode = 1;
  });
}
