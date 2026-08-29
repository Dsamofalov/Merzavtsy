import { isAddress, zeroAddress, type Address } from "viem";

export interface DeploymentMetadata {
  chainId: bigint;
  identityAddress: Address;
  worldAddress: Address;
  oracleAddress: Address;
  deploymentBlock: bigint;
  deployedAt: string;
}

function positiveBigIntString(value: unknown, name: string): bigint {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
    throw new Error(`${name} must be a positive integer string`);
  }
  const parsed = BigInt(value);
  if (parsed <= 0n) throw new Error(`${name} must be a positive integer string`);
  return parsed;
}

function nonZeroAddress(value: unknown, name: string): Address {
  if (
    typeof value !== "string"
    || !isAddress(value, { strict: false })
    || value.toLowerCase() === zeroAddress
  ) {
    throw new Error(`${name} must be a non-zero Ethereum address`);
  }
  return value as Address;
}

export function parseDeploymentMetadata(serialized: string): DeploymentMetadata {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("deployment metadata JSON is invalid");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("deployment metadata JSON must contain an object");
  }
  const value = parsed as Record<string, unknown>;
  const deployedAt = value.deployedAt;
  if (typeof deployedAt !== "string" || !Number.isFinite(Date.parse(deployedAt))) {
    throw new Error("deployedAt must be a valid timestamp");
  }

  return {
    chainId: positiveBigIntString(value.chainId, "chainId"),
    identityAddress: nonZeroAddress(value.identityAddress, "identityAddress"),
    worldAddress: nonZeroAddress(value.worldAddress, "worldAddress"),
    oracleAddress: nonZeroAddress(value.oracleAddress, "oracleAddress"),
    deploymentBlock: positiveBigIntString(value.deploymentBlock, "deploymentBlock"),
    deployedAt,
  };
}

export function assertDeploymentMatches(
  deployment: DeploymentMetadata,
  expected: Pick<DeploymentMetadata, "chainId" | "identityAddress" | "worldAddress" | "oracleAddress">,
): void {
  if (deployment.chainId !== expected.chainId) {
    throw new Error(`deployment chainId mismatch: ${deployment.chainId} != ${expected.chainId}`);
  }
  for (const field of ["identityAddress", "worldAddress", "oracleAddress"] as const) {
    if (deployment[field].toLowerCase() !== expected[field].toLowerCase()) {
      throw new Error(`deployment ${field} mismatch: ${deployment[field]} != ${expected[field]}`);
    }
  }
}
