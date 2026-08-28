import { isAddress, isHex, type Address, type Hex } from "viem";
import type { ObservedBlock, ObservedTransaction } from "./types.js";

export interface RpcTransactionLike {
  hash: string;
  from: string;
  to: string | null;
  value: bigint;
  input: string;
}

export interface RpcBlockLike {
  number: bigint | null;
  hash: string | null;
  parentHash: string;
  timestamp: bigint;
  transactions: readonly RpcTransactionLike[];
}

export interface RpcReceiptLike {
  transactionHash: string;
  blockNumber: bigint | null;
  blockHash: string | null;
  gasUsed: bigint;
  contractAddress: string | null;
}

function bytes32(value: string | null, label: string): Hex {
  if (value === null || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${label} must be a 32-byte hex value`);
  }
  return value as Hex;
}

function address(value: string, label: string): Address {
  if (!isAddress(value, { strict: false })) {
    throw new Error(`${label} must be an Ethereum address`);
  }
  return value as Address;
}

function optionalAddress(value: string | null, label: string): Address | null {
  return value === null ? null : address(value, label);
}

function inputHex(value: string): Hex {
  if (!isHex(value)) throw new Error("transaction input must be hex");
  return value as Hex;
}

/**
 * Joins a finalized block's structured transactions to their receipts and
 * returns the canonical watcher representation consumed by RuntimePhases.
 * Every transaction must have exactly one receipt from the same block.
 */
export function normalizeObservedBlock(
  chainId: bigint,
  block: RpcBlockLike,
  receipts: readonly RpcReceiptLike[],
): ObservedBlock {
  if (chainId <= 0n) throw new Error("chainId must be positive");
  if (block.number === null) throw new Error("finalized block number is required");
  if (block.number < 0n) throw new Error("block number must be non-negative");
  if (block.hash === null) throw new Error("finalized block hash is required");
  if (block.timestamp < 0n) throw new Error("block timestamp must be non-negative");

  const blockHash = bytes32(block.hash, "finalized block hash");
  const parentHash = bytes32(block.parentHash, "parent hash");
  const receiptByHash = new Map<string, RpcReceiptLike>();

  for (const receipt of receipts) {
    const transactionHash = bytes32(receipt.transactionHash, "receipt transaction hash");
    const key = transactionHash.toLowerCase();
    if (receiptByHash.has(key)) throw new Error(`duplicate receipt for ${transactionHash}`);
    receiptByHash.set(key, receipt);
  }

  const transactions: ObservedTransaction[] = block.transactions.map((tx) => {
    const txHash = bytes32(tx.hash, "transaction hash");
    const receipt = receiptByHash.get(txHash.toLowerCase());
    if (receipt === undefined) throw new Error(`missing receipt for ${txHash}`);
    if (
      receipt.blockNumber !== block.number
      || receipt.blockHash === null
      || receipt.blockHash.toLowerCase() !== blockHash.toLowerCase()
    ) {
      throw new Error(`receipt block mismatch for ${txHash}`);
    }
    if (receipt.gasUsed < 0n) throw new Error(`receipt gasUsed must be non-negative for ${txHash}`);

    receiptByHash.delete(txHash.toLowerCase());
    return {
      chainId,
      blockNumber: block.number,
      blockHash,
      txHash,
      from: address(tx.from, "transaction from"),
      to: optionalAddress(tx.to, "transaction to"),
      value: tx.value,
      gasUsed: receipt.gasUsed,
      input: inputHex(tx.input),
      createdContract: optionalAddress(receipt.contractAddress, "receipt contractAddress"),
    };
  });

  if (receiptByHash.size !== 0) {
    throw new Error("receipt set contains transactions not present in the block");
  }

  return {
    number: block.number,
    hash: blockHash,
    parentHash,
    timestamp: block.timestamp,
    transactions,
  };
}
