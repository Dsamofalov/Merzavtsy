import { isAddress, zeroAddress, type Address, type Hex } from "viem";

export interface RuntimeConfig {
  rpcUrl: string;
  chainId: bigint;
  identityAddress: Address;
  worldAddress: Address;
  oracleAddress: Address;
  oraclePrivateKey: Hex;
  submitterPrivateKey: Hex;
  dbPath: string;
  finalityDepth: bigint;
  epochBlocks: bigint;
  pollIntervalMs: number;
  /** Plain ETH transfers below this value remain observable but do not earn transfer/diversity progression. */
  minimumMeaningfulWei?: bigint;
  localMode: boolean;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function localModeOf(env: NodeJS.ProcessEnv): boolean {
  const value = env.LOCAL_MODE?.trim();
  if (value === undefined || value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new Error("LOCAL_MODE must be true or false");
}

function positiveBigInt(value: string, name: string): bigint {
  if (!/^[0-9]+$/.test(value)) throw new Error(`${name} must be a positive integer`);
  const parsed = BigInt(value);
  if (parsed <= 0n) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function nonNegativeBigInt(value: string, name: string): bigint {
  if (!/^[0-9]+$/.test(value)) throw new Error(`${name} must be a non-negative integer`);
  return BigInt(value);
}

function positiveSafeInteger(value: string, name: string): number {
  if (!/^[0-9]+$/.test(value)) throw new Error(`${name} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return parsed;
}

function address(env: NodeJS.ProcessEnv, name: string): Address {
  const value = required(env, name);
  if (!isAddress(value, { strict: false }) || value.toLowerCase() === zeroAddress) {
    throw new Error(`${name} must be a non-zero Ethereum address`);
  }
  return value as Address;
}

function privateKey(env: NodeJS.ProcessEnv, name: string): Hex {
  const value = required(env, name);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be a 32-byte 0x-prefixed private key`);
  }
  return value as Hex;
}

function rpcUrl(env: NodeJS.ProcessEnv): string {
  const value = required(env, "RPC_URL");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("RPC_URL must be a valid http(s) URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("RPC_URL must be a valid http(s) URL");
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const localMode = localModeOf(env);
  const chainId = positiveBigInt(required(env, "CHAIN_ID"), "CHAIN_ID");
  const epochBlocks = positiveBigInt(required(env, "EPOCH_BLOCKS"), "EPOCH_BLOCKS");
  const oraclePrivateKey = privateKey(env, "ORACLE_PRIVATE_KEY");
  const submitterPrivateKey = privateKey(env, "SUBMITTER_PRIVATE_KEY");
  if (oraclePrivateKey.toLowerCase() === submitterPrivateKey.toLowerCase()) {
    throw new Error(
      "ORACLE_PRIVATE_KEY and SUBMITTER_PRIVATE_KEY must use different keys",
    );
  }

  const dbPath = localMode
    ? env.DB_PATH?.trim() || "./data/merzavtsy.sqlite"
    : required(env, "DB_PATH");
  const finalityDepth = localMode
    ? positiveBigInt(env.FINALITY_DEPTH?.trim() || "1", "FINALITY_DEPTH")
    : positiveBigInt(required(env, "FINALITY_DEPTH"), "FINALITY_DEPTH");
  const pollIntervalMs = localMode
    ? positiveSafeInteger(env.POLL_INTERVAL_MS?.trim() || "1000", "POLL_INTERVAL_MS")
    : positiveSafeInteger(required(env, "POLL_INTERVAL_MS"), "POLL_INTERVAL_MS");
  const minimumMeaningfulWei = nonNegativeBigInt(
    env.MINIMUM_MEANINGFUL_WEI?.trim() || "0",
    "MINIMUM_MEANINGFUL_WEI",
  );

  return {
    rpcUrl: rpcUrl(env),
    chainId,
    identityAddress: address(env, "IDENTITY_ADDRESS"),
    worldAddress: address(env, "WORLD_ADDRESS"),
    oracleAddress: address(env, "ORACLE_ADDRESS"),
    oraclePrivateKey,
    submitterPrivateKey,
    dbPath,
    finalityDepth,
    epochBlocks,
    pollIntervalMs,
    minimumMeaningfulWei,
    localMode,
  };
}