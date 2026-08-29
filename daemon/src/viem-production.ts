import type { Address, Hex } from "viem";
import { IDENTITY_ABI, ORACLE_ABI, WORLD_ABI } from "./contract-abis.js";
import type { ProductionIoDependencies, ProductionAddresses } from "./production-io.js";
import type { RpcBlockSourceDependencies } from "./rpc-source.js";
import type { RpcBlockLike, RpcReceiptLike } from "./rpc-blocks.js";
import type { ActivityAttestation } from "./attestation.js";
import type { PeerAttestation } from "./peer-attestation.js";
import type { BornLogLike, IndexedLogLike, LifeStateLike } from "./viem-adapter.js";

interface PublicClientLike {
  getChainId(): Promise<number>;
  getBytecode(request: { address: Address; blockNumber?: bigint }): Promise<Hex | undefined>;
  readContract(request: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }): Promise<unknown>;
  getLogs(request: {
    address: Address;
    event?: unknown;
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<readonly unknown[]>;
  waitForTransactionReceipt(request: { hash: Hex }): Promise<{ status: "success" | "reverted" }>;
  getBlock(request: {
    blockNumber?: bigint;
    blockTag?: string;
    includeTransactions?: boolean;
  }): Promise<unknown>;
  getTransactionReceipt(request: { hash: Hex }): Promise<unknown>;
  getBlockNumber(): Promise<bigint>;
}

interface WalletClientLike {
  writeContract(request: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }): Promise<Hex>;
}

export interface ViemProductionAdapterOptions {
  addresses: ProductionAddresses;
  publicClient: PublicClientLike;
  walletClient: WalletClientLike;
}

export interface ViemProductionAdapter {
  production: ProductionIoDependencies;
  blocks: RpcBlockSourceDependencies;
  getHeadBlock(): Promise<bigint>;
  destinationHasCode(address: Address, blockNumber: bigint): Promise<boolean>;
}

function asAddress(value: unknown, label: string): Address {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${label} returned an invalid address`);
  }
  return value as Address;
}

function asBigInt(value: unknown, label: string): bigint {
  if (typeof value !== "bigint") throw new Error(`${label} returned a non-bigint value`);
  return value;
}

function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} returned a non-boolean value`);
  return value;
}

function asLifeState(value: unknown): LifeStateLike {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("stateOf returned an invalid creature state");
  }
  const state = value as Record<string, unknown>;
  const lastLifeTickAt = state.lastLifeTickAt;
  const hibernating = state.hibernating;
  if ((typeof lastLifeTickAt !== "bigint" && typeof lastLifeTickAt !== "number") || typeof hibernating !== "boolean") {
    throw new Error("stateOf returned an invalid creature state");
  }
  return { lastLifeTickAt, hibernating };
}

/**
 * Adapts viem-style public/wallet clients to the daemon's narrow runtime I/O
 * interfaces. No persistence, classification or retry state lives here.
 */
export function createViemProductionAdapter(
  options: ViemProductionAdapterOptions,
): ViemProductionAdapter {
  const { addresses, publicClient, walletClient } = options;

  const production: ProductionIoDependencies = {
    async getChainId() {
      const value = await publicClient.getChainId();
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error("RPC returned an invalid chain id");
      return BigInt(value);
    },
    async hasCode(address) {
      const bytecode = await publicClient.getBytecode({ address });
      return bytecode !== undefined && bytecode !== "0x";
    },
    async readIdentityWorld() {
      return asAddress(await publicClient.readContract({
        address: addresses.identity,
        abi: IDENTITY_ABI,
        functionName: "world",
      }), "identity.world");
    },
    async readWorldOracle() {
      return asAddress(await publicClient.readContract({
        address: addresses.world,
        abi: WORLD_ABI,
        functionName: "oracle",
      }), "world.oracle");
    },
    async readOracleIdentity() {
      return asAddress(await publicClient.readContract({
        address: addresses.oracle,
        abi: ORACLE_ABI,
        functionName: "identity",
      }), "oracle.identity");
    },
    async readOracleWorld() {
      return asAddress(await publicClient.readContract({
        address: addresses.oracle,
        abi: ORACLE_ABI,
        functionName: "world",
      }), "oracle.world");
    },
    async getBornLogs(fromBlock, toBlock) {
      return await publicClient.getLogs({
        address: addresses.identity,
        event: IDENTITY_ABI[1],
        fromBlock,
        toBlock,
      }) as readonly BornLogLike[];
    },
    async getRawLogs(address, fromBlock, toBlock) {
      return await publicClient.getLogs({ address, fromBlock, toBlock }) as readonly IndexedLogLike[];
    },
    async activityNonce(wallet) {
      return asBigInt(await publicClient.readContract({
        address: addresses.oracle,
        abi: ORACLE_ABI,
        functionName: "nonces",
        args: [wallet],
      }), "oracle.nonces");
    },
    async peerNonce(wallet) {
      return asBigInt(await publicClient.readContract({
        address: addresses.oracle,
        abi: ORACLE_ABI,
        functionName: "peerNonces",
        args: [wallet],
      }), "oracle.peerNonces");
    },
    async epochConsumed(tokenId, epochId) {
      return asBoolean(await publicClient.readContract({
        address: addresses.oracle,
        abi: ORACLE_ABI,
        functionName: "processedEpoch",
        args: [tokenId, epochId],
      }), "oracle.processedEpoch");
    },
    async peerConsumed(encounterDigest) {
      return asBoolean(await publicClient.readContract({
        address: addresses.oracle,
        abi: ORACLE_ABI,
        functionName: "processedPeerEncounter",
        args: [encounterDigest],
      }), "oracle.processedPeerEncounter");
    },
    async submitActivity(attestation: ActivityAttestation, signature: Hex) {
      return walletClient.writeContract({
        address: addresses.oracle,
        abi: ORACLE_ABI,
        functionName: "submit",
        args: [attestation, signature],
      });
    },
    async submitPeer(attestation: PeerAttestation, signature: Hex) {
      return walletClient.writeContract({
        address: addresses.oracle,
        abi: ORACLE_ABI,
        functionName: "submitPeer",
        args: [attestation, signature],
      });
    },
    async waitForReceipt(txHash) {
      return (await publicClient.waitForTransactionReceipt({ hash: txHash })).status;
    },
    async readLifeState(tokenId) {
      return asLifeState(await publicClient.readContract({
        address: addresses.world,
        abi: WORLD_ABI,
        functionName: "stateOf",
        args: [tokenId],
      }));
    },
    async sendLifeTick(tokenId) {
      return walletClient.writeContract({
        address: addresses.world,
        abi: WORLD_ABI,
        functionName: "lifeTick",
        args: [tokenId],
      });
    },
    async latestBlockTimestamp() {
      const block = await publicClient.getBlock({ blockTag: "latest" }) as { timestamp?: unknown };
      return asBigInt(block.timestamp, "latest block timestamp");
    },
  };

  const blocks: RpcBlockSourceDependencies = {
    async getBlock(blockNumber): Promise<RpcBlockLike> {
      return await publicClient.getBlock({
        blockNumber,
        includeTransactions: true,
      }) as RpcBlockLike;
    },
    async getReceipt(txHash): Promise<RpcReceiptLike> {
      return await publicClient.getTransactionReceipt({ hash: txHash }) as RpcReceiptLike;
    },
  };

  return {
    production,
    blocks,
    getHeadBlock: () => publicClient.getBlockNumber(),
    async destinationHasCode(address, blockNumber) {
      const bytecode = await publicClient.getBytecode({ address, blockNumber });
      return bytecode !== undefined && bytecode !== "0x";
    },
  };
}
