import type { Address } from "viem";
import type { RuntimeConfig } from "./config.js";
import type { DeploymentMetadata } from "./deployment.js";

export interface BootstrapChainState {
  chainId: bigint;
  identityWorld: string;
  worldOracle: string;
  oracleIdentity: string;
  oracleWorld: string;
  identityHasCode: boolean;
  worldHasCode: boolean;
  oracleHasCode: boolean;
}

function sameAddress(left: string, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function requireAddressMatch(
  label: string,
  actual: string,
  expected: Address,
): void {
  if (!sameAddress(actual, expected)) {
    throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
  }
}

/**
 * Fail closed before the daemon opens its runtime loop. Deployment metadata,
 * configured addresses and the contracts' own wiring must all describe the
 * same chain topology.
 */
export function validateBootstrap(
  config: RuntimeConfig,
  deployment: DeploymentMetadata,
  chain: BootstrapChainState,
): void {
  if (config.chainId !== deployment.chainId) {
    throw new Error(
      `deployment chainId mismatch: config=${config.chainId}, deployment=${deployment.chainId}`,
    );
  }
  if (chain.chainId !== config.chainId) {
    throw new Error(`RPC chainId mismatch: expected ${config.chainId}, got ${chain.chainId}`);
  }

  requireAddressMatch(
    "deployment identityAddress",
    config.identityAddress,
    deployment.identityAddress,
  );
  requireAddressMatch(
    "deployment worldAddress",
    config.worldAddress,
    deployment.worldAddress,
  );
  requireAddressMatch(
    "deployment oracleAddress",
    config.oracleAddress,
    deployment.oracleAddress,
  );

  const bytecodeChecks: readonly [string, boolean][] = [
    ["identityAddress", chain.identityHasCode],
    ["worldAddress", chain.worldHasCode],
    ["oracleAddress", chain.oracleHasCode],
  ];
  for (const [label, hasCode] of bytecodeChecks) {
    if (!hasCode) throw new Error(`${label} has no bytecode`);
  }

  requireAddressMatch("identity.world", chain.identityWorld, deployment.worldAddress);
  requireAddressMatch("world.oracle", chain.worldOracle, deployment.oracleAddress);
  requireAddressMatch("oracle.identity", chain.oracleIdentity, deployment.identityAddress);
  requireAddressMatch("oracle.world", chain.oracleWorld, deployment.worldAddress);
}
