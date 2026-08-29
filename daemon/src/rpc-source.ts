import type { Hex } from "viem";
import {
  normalizeObservedBlock,
  type RpcBlockLike,
  type RpcReceiptLike,
} from "./rpc-blocks.js";
import type { ObservedBlock } from "./types.js";

export interface RpcBlockSourceDependencies {
  getBlock(blockNumber: bigint): Promise<RpcBlockLike>;
  getReceipt(txHash: Hex): Promise<RpcReceiptLike>;
}

/**
 * Small bounded network orchestration layer for finalized block ingestion.
 * It deliberately owns no classification or persistence state.
 */
export class RpcBlockSource {
  readonly #chainId: bigint;
  readonly #dependencies: RpcBlockSourceDependencies;
  readonly #maxBlocks: bigint;

  constructor(
    chainId: bigint,
    dependencies: RpcBlockSourceDependencies,
    maxBlocks = 256n,
  ) {
    if (chainId <= 0n) throw new Error("chainId must be positive");
    if (maxBlocks <= 0n) throw new Error("maxBlocks must be positive");
    this.#chainId = chainId;
    this.#dependencies = dependencies;
    this.#maxBlocks = maxBlocks;
  }

  async getBlocks(fromBlock: bigint, toBlock: bigint): Promise<ObservedBlock[]> {
    if (fromBlock < 0n || toBlock < fromBlock) {
      throw new Error(`invalid block range ${fromBlock}..${toBlock}`);
    }
    const count = toBlock - fromBlock + 1n;
    if (count > this.#maxBlocks) {
      throw new Error(
        `block range ${fromBlock}..${toBlock} exceeds configured maximum ${this.#maxBlocks}`,
      );
    }

    const result: ObservedBlock[] = [];
    for (let blockNumber = fromBlock; blockNumber <= toBlock; blockNumber += 1n) {
      const block = await this.#dependencies.getBlock(blockNumber);
      const receipts = await Promise.all(
        block.transactions.map((transaction) =>
          this.#dependencies.getReceipt(transaction.hash as Hex),
        ),
      );
      result.push(normalizeObservedBlock(this.#chainId, block, receipts));
    }
    return result;
  }
}
