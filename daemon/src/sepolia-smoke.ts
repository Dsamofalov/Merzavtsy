import type { Address } from "viem";

export const SEPOLIA_CHAIN_ID = 11_155_111n;

export function validateSepoliaSmokeTarget(chainId: bigint): bigint {
  if (chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error(`Sepolia smoke test requires chainId ${SEPOLIA_CHAIN_ID}, got ${chainId}`);
  }
  return chainId;
}

export interface SepoliaSmokeProof {
  version: 1;
  chainId: "11155111";
  headBlock: string;
  deploymentBlock: string;
  identityAddress: Address;
  worldAddress: Address;
  oracleAddress: Address;
  deployedAt: string;
  observedAt: string;
  healthy: true;
}

export function buildSepoliaSmokeProof(input: {
  chainId: bigint;
  headBlock: bigint;
  deploymentBlock: bigint;
  identityAddress: Address;
  worldAddress: Address;
  oracleAddress: Address;
  deployedAt: string;
  healthy: boolean;
  observedAt?: string;
}): SepoliaSmokeProof {
  validateSepoliaSmokeTarget(input.chainId);
  if (!input.healthy) throw new Error("Sepolia deployment is not healthy; refusing to emit proof");
  if (input.headBlock < input.deploymentBlock) throw new Error("Sepolia head is older than deployment block");
  const observedAt = input.observedAt ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(observedAt))) throw new Error("Sepolia proof observedAt must be an ISO timestamp");
  return {
    version: 1,
    chainId: "11155111",
    headBlock: input.headBlock.toString(),
    deploymentBlock: input.deploymentBlock.toString(),
    identityAddress: input.identityAddress,
    worldAddress: input.worldAddress,
    oracleAddress: input.oracleAddress,
    deployedAt: input.deployedAt,
    observedAt,
    healthy: true,
  };
}
