import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  createPublicClient,
  defineChain,
  http,
  type Address,
  type Hex,
  type LocalAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildAttestation,
  signAttestation,
  type ActivityAttestation,
} from "../daemon/src/attestation.js";
import { ORACLE_ABI } from "../daemon/src/contract-abis.js";
import { parseDeploymentMetadata } from "../daemon/src/deployment.js";
import { DaemonStore } from "../daemon/src/store.js";
import type {
  CategoryCounters,
  EpochSummary,
  NeedDeltas,
  PersonalityDeltas,
} from "../daemon/src/types.js";

const DEFAULT_TTL_SECONDS = 900n;
const MAX_TTL_SECONDS = 3600n;

export interface ManualSignDriver {
  chainId(): Promise<bigint>;
  isEpochConsumed(tokenId: bigint, epochId: Hex): Promise<boolean>;
  activityNonce(wallet: Address): Promise<bigint>;
}

export interface SignedAttestationEnvelope {
  version: 1;
  oracleAddress: Address;
  attestation: ActivityAttestation;
  signature: Hex;
}

export async function buildManualSignedAttestation(options: {
  expectedChainId: bigint;
  oracleAddress: Address;
  summary: EpochSummary;
  signer: LocalAccount;
  now: bigint;
  ttlSeconds: bigint;
  driver: ManualSignDriver;
}): Promise<SignedAttestationEnvelope> {
  if (options.summary.chainId !== options.expectedChainId) {
    throw new Error(
      `epoch chainId mismatch: expected ${options.expectedChainId}, got ${options.summary.chainId}`,
    );
  }
  if (options.now < 0n) throw new Error("current chain time must be non-negative");
  if (options.ttlSeconds <= 0n || options.ttlSeconds > MAX_TTL_SECONDS) {
    throw new Error(`attestation TTL must be between 1 and ${MAX_TTL_SECONDS} seconds`);
  }

  const connectedChain = await options.driver.chainId();
  if (connectedChain !== options.expectedChainId) {
    throw new Error(
      `chainId mismatch: expected ${options.expectedChainId}, got ${connectedChain}`,
    );
  }

  if (
    await options.driver.isEpochConsumed(
      options.summary.tokenId,
      options.summary.epochId,
    )
  ) {
    throw new Error(`epoch ${options.summary.epochId} is already consumed`);
  }

  const nonce = await options.driver.activityNonce(options.summary.wallet);
  if (nonce < 0n) throw new Error("oracle nonce must be non-negative");
  const attestation = buildAttestation(
    options.summary,
    nonce,
    options.now + options.ttlSeconds,
  );
  const signature = await signAttestation(
    options.signer,
    options.oracleAddress,
    attestation,
  );

  return {
    version: 1,
    oracleAddress: options.oracleAddress,
    attestation,
    signature,
  };
}

function decimal(value: bigint): string {
  return value.toString(10);
}

export function serializeSignedAttestationEnvelope(
  envelope: SignedAttestationEnvelope,
): string {
  return JSON.stringify(
    {
      version: envelope.version,
      oracleAddress: envelope.oracleAddress,
      attestation: {
        wallet: envelope.attestation.wallet,
        tokenId: decimal(envelope.attestation.tokenId),
        chainId: decimal(envelope.attestation.chainId),
        fromBlock: decimal(envelope.attestation.fromBlock),
        toBlock: decimal(envelope.attestation.toBlock),
        epochId: envelope.attestation.epochId,
        activityDigest: envelope.attestation.activityDigest,
        xpDelta: decimal(envelope.attestation.xpDelta),
        personalityDeltas: envelope.attestation.personalityDeltas,
        needDeltas: envelope.attestation.needDeltas,
        categoryCounters: envelope.attestation.categoryCounters,
        nonce: decimal(envelope.attestation.nonce),
        deadline: decimal(envelope.attestation.deadline),
      },
      signature: envelope.signature,
    },
    null,
    2,
  );
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function address(value: unknown, label: string): Address {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${label} must be an Ethereum address`);
  }
  return value as Address;
}

function hex32(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${label} must be bytes32`);
  }
  return value as Hex;
}

function signature(value: unknown): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(value)) {
    throw new Error("signature must be a 65-byte hex value");
  }
  return value as Hex;
}

function unsignedDecimal(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be a decimal string`);
  }
  return BigInt(value);
}

function numericTuple(
  value: unknown,
  length: number,
  min: number,
  max: number,
  label: string,
): number[] {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error(`${label} must contain exactly ${length} entries`);
  }
  return value.map((entry) => {
    if (!Number.isInteger(entry) || entry < min || entry > max) {
      throw new Error(`${label} contains an out-of-range value`);
    }
    return entry;
  });
}

export function parseSignedAttestationEnvelope(
  serialized: string,
): SignedAttestationEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("signed attestation is not valid JSON");
  }
  const root = object(parsed, "signed attestation");
  if (root.version !== 1) throw new Error("unsupported signed attestation version");
  const raw = object(root.attestation, "attestation");

  const personalityDeltas = numericTuple(
    raw.personalityDeltas,
    8,
    -32768,
    32767,
    "personalityDeltas",
  ) as PersonalityDeltas;
  const needDeltas = numericTuple(
    raw.needDeltas,
    5,
    -32768,
    32767,
    "needDeltas",
  ) as NeedDeltas;
  const categoryCounters = numericTuple(
    raw.categoryCounters,
    10,
    0,
    65535,
    "categoryCounters",
  ) as CategoryCounters;

  const attestation: ActivityAttestation = {
    wallet: address(raw.wallet, "attestation.wallet"),
    tokenId: unsignedDecimal(raw.tokenId, "attestation.tokenId"),
    chainId: unsignedDecimal(raw.chainId, "attestation.chainId"),
    fromBlock: unsignedDecimal(raw.fromBlock, "attestation.fromBlock"),
    toBlock: unsignedDecimal(raw.toBlock, "attestation.toBlock"),
    epochId: hex32(raw.epochId, "attestation.epochId"),
    activityDigest: hex32(raw.activityDigest, "attestation.activityDigest"),
    xpDelta: unsignedDecimal(raw.xpDelta, "attestation.xpDelta"),
    personalityDeltas,
    needDeltas,
    categoryCounters,
    nonce: unsignedDecimal(raw.nonce, "attestation.nonce"),
    deadline: unsignedDecimal(raw.deadline, "attestation.deadline"),
  };
  if (attestation.chainId <= 0n) throw new Error("attestation.chainId must be positive");
  if (attestation.toBlock < attestation.fromBlock) {
    throw new Error("attestation block range is reversed");
  }

  return {
    version: 1,
    oracleAddress: address(root.oracleAddress, "oracleAddress"),
    attestation,
    signature: signature(root.signature),
  };
}

function positiveChainId(value: string | undefined): bigint {
  if (value === undefined || !/^[0-9]+$/.test(value)) {
    throw new Error("CHAIN_ID is required and must be a positive integer");
  }
  const chainId = BigInt(value);
  if (chainId <= 0n) throw new Error("CHAIN_ID must be positive");
  return chainId;
}

function rpcUrl(value: string | undefined): string {
  if (value === undefined || value.length === 0) throw new Error("RPC_URL is required");
  try {
    new URL(value);
  } catch {
    throw new Error("RPC_URL must be a valid URL");
  }
  return value;
}

function privateKey(value: string | undefined): Hex {
  if (value === undefined || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("ORACLE_PRIVATE_KEY must be a 32-byte hex private key");
  }
  return value as Hex;
}

function epochId(value: string | undefined): Hex {
  if (value === undefined || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("usage: npm run sign:attestation -- <epochId>");
  }
  return value as Hex;
}

function dbPath(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error("DB_PATH is required for manual attestation signing");
  }
  return value;
}

function ttlSeconds(value: string | undefined): bigint {
  if (value === undefined || value.length === 0) return DEFAULT_TTL_SECONDS;
  if (!/^[0-9]+$/.test(value)) throw new Error("ATTESTATION_TTL_SECONDS must be an integer");
  const ttl = BigInt(value);
  if (ttl <= 0n || ttl > MAX_TTL_SECONDS) {
    throw new Error(`ATTESTATION_TTL_SECONDS must be between 1 and ${MAX_TTL_SECONDS}`);
  }
  return ttl;
}

export async function runSignAttestationCli(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv.slice(2),
): Promise<SignedAttestationEnvelope> {
  const chainId = positiveChainId(env.CHAIN_ID);
  const url = rpcUrl(env.RPC_URL);
  const requestedEpoch = epochId(argv[0]);
  const deployment = parseDeploymentMetadata(
    await readFile(`deployments/${chainId}.json`, "utf8"),
  );
  if (deployment.chainId !== chainId) {
    throw new Error(
      `deployment file chain mismatch: expected ${chainId}, got ${deployment.chainId}`,
    );
  }
  if (chainId > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("CHAIN_ID exceeds viem safe integer range");
  }

  const store = new DaemonStore(dbPath(env.DB_PATH));
  try {
    const stored = store.getEpoch(requestedEpoch);
    if (stored === null) throw new Error(`epoch ${requestedEpoch} was not found in SQLite`);
    if (stored.completed) throw new Error(`epoch ${requestedEpoch} is already completed locally`);

    const chain = defineChain({
      id: Number(chainId),
      name: `Merzavtsy signer ${chainId}`,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [url] } },
    });
    const publicClient = createPublicClient({ chain, transport: http(url) });
    const signer = privateKeyToAccount(privateKey(env.ORACLE_PRIVATE_KEY));
    const latest = await publicClient.getBlock({ blockTag: "latest" });
    const now = latest.timestamp;

    const envelope = await buildManualSignedAttestation({
      expectedChainId: chainId,
      oracleAddress: deployment.oracleAddress,
      summary: stored.summary,
      signer,
      now,
      ttlSeconds: ttlSeconds(env.ATTESTATION_TTL_SECONDS),
      driver: {
        async chainId() {
          return BigInt(await publicClient.getChainId());
        },
        async isEpochConsumed(tokenId, id) {
          return publicClient.readContract({
            address: deployment.oracleAddress,
            abi: ORACLE_ABI,
            functionName: "processedEpoch",
            args: [tokenId, id],
          });
        },
        async activityNonce(wallet) {
          return publicClient.readContract({
            address: deployment.oracleAddress,
            abi: ORACLE_ABI,
            functionName: "nonces",
            args: [wallet],
          });
        },
      },
    });

    console.log(serializeSignedAttestationEnvelope(envelope));
    return envelope;
  } finally {
    store.close();
  }
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && pathToFileURL(entry).href === import.meta.url;
}

if (isDirectExecution()) {
  runSignAttestationCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown signing error";
    console.error(`Merzavtsy attestation signing failed: ${message}`);
    process.exitCode = 1;
  });
}
