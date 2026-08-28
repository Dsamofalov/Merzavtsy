import type { Address, Hex } from "viem";

/**
 * Canonical category order. These numeric values are a protocol boundary and
 * MUST stay aligned with MutationRules.sol and ActivityAttestation.categoryCounters.
 */
export enum ActivityCategory {
  TX_SENT = 0,
  TX_RECEIVED = 1,
  CONTRACT_CALL = 2,
  NEW_CONTRACT = 3,
  REPEAT_CONTRACT = 4,
  CONTRACT_DEPLOY = 5,
  UNIQUE_COUNTERPARTY = 6,
  REGISTERED_PEER_CONTACT = 7,
  HIGH_GAS_ACTIVITY = 8,
  SELECTOR_DIVERSITY = 9,
}

export type CategoryCounters = [number, number, number, number, number, number, number, number, number, number];
export type MutationCounters = [number, number, number, number];
export type PersonalityDeltas = [number, number, number, number, number, number, number, number];
export type NeedDeltas = [number, number, number, number, number];

export interface ObservedTransaction {
  chainId: bigint;
  blockNumber: bigint;
  blockHash: Hex;
  txHash: Hex;
  from: Address;
  to: Address | null;
  value: bigint;
  gasUsed: bigint;
  input: Hex;
  createdContract: Address | null;
}

export interface ObservedBlock {
  number: bigint;
  hash: Hex;
  parentHash: Hex;
  timestamp: bigint;
  transactions: ObservedTransaction[];
}

export interface ClassifierContext {
  wallet: Address;
  tokenId: bigint;
  registeredPeers: ReadonlyMap<string, bigint>;
  knownContracts: ReadonlySet<string>;
  seenContracts: ReadonlySet<string>;
  seenCounterparties: ReadonlySet<string>;
  seenSelectors: ReadonlySet<string>;
  highGasThreshold: bigint;
  destinationHasCode: boolean;
}

export interface ClassifiedActivity {
  category: ActivityCategory;
  units: number;
  blockNumber: bigint;
  txHash: Hex;
  peerTokenId?: bigint;
  contract?: Address;
  selector?: Hex;
}

export interface EpochSummary {
  wallet: Address;
  tokenId: bigint;
  chainId: bigint;
  fromBlock: bigint;
  toBlock: bigint;
  epochId: Hex;
  activityDigest: Hex;
  xpDelta: bigint;
  personalityDeltas: PersonalityDeltas;
  needDeltas: NeedDeltas;
  categoryCounters: CategoryCounters;
  /**
   * Explicit mutation-only counters, separate from stable category indexes:
   * 0 cadence bursts, 1 bridge/network-like observations,
   * 2 hostile-social observations, 3 repeated protocol co-occurrence.
   */
  mutationCounters: MutationCounters;
}
