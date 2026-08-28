import type { Address } from "viem";
import { DaemonStore } from "./store.js";

/**
 * Store-backed registry of Born events. The SQLite store is authoritative;
 * this facade intentionally owns no mutable cache that could diverge on restart.
 */
export class Registry {
  constructor(readonly store: DaemonStore) {}

  applyBorn(owner: Address, tokenId: bigint, blockNumber: bigint): boolean {
    return this.store.recordBirth(owner, tokenId, blockNumber);
  }

  tokenForWallet(owner: Address): bigint | null {
    return this.store.tokenForWallet(owner);
  }

  walletForToken(tokenId: bigint): string | null {
    return this.store.walletForToken(tokenId);
  }
}
