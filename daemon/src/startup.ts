import type { BootstrapChainState } from "./bootstrap.js";
import { validateBootstrap } from "./bootstrap.js";
import type { RuntimeConfig } from "./config.js";
import type { DeploymentMetadata } from "./deployment.js";

export function deploymentPath(chainId: bigint): string {
  if (chainId <= 0n) throw new Error("chainId must be positive");
  return `deployments/${chainId}.json`;
}

/**
 * Critical startup ordering boundary: validate the live chain and contract
 * topology before opening SQLite. A wrong RPC/network therefore cannot create
 * or mutate durable watcher state.
 */
export async function openStoreAfterBootstrap<T>(
  config: RuntimeConfig,
  deployment: DeploymentMetadata,
  readChainState: () => Promise<BootstrapChainState>,
  openStore: () => T,
): Promise<T> {
  const chainState = await readChainState();
  validateBootstrap(config, deployment, chainState);
  return openStore();
}
