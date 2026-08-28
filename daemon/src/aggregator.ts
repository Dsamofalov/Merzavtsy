import { encodePacked, keccak256, toHex } from "viem";
import {
  ActivityCategory,
  type CategoryCounters,
  type ClassifiedActivity,
  type EpochSummary,
  type MutationCounters,
  type NeedDeltas,
  type PersonalityDeltas,
} from "./types.js";
import type { Address } from "viem";

const MAX_XP_DELTA = 10_000;
const MAX_PERSONALITY_DELTA = 1_000;
const MAX_NEED_DELTA = 2_000;
const MAX_CATEGORY_COUNTER = 1_000;
const MAX_MUTATION_COUNTER = 1_000;

const XP_POINTS: CategoryCounters = [10, 10, 25, 40, 10, 100, 20, 50, 15, 30];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

function blankCounters(): CategoryCounters {
  return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
}

function blankMutationCounters(): MutationCounters {
  return [0, 0, 0, 0];
}

/**
 * Diminishing return score scaled by 100:
 * - first unit: 100%
 * - next four: 50%
 * - next fifteen: 20%
 * - further repeats: 0% for progression in the same epoch
 */
function diminishingScore(count: number): number {
  if (count <= 0) return 0;
  const first = Math.min(count, 1) * 100;
  const nextFour = Math.min(Math.max(count - 1, 0), 4) * 50;
  const nextFifteen = Math.min(Math.max(count - 5, 0), 15) * 20;
  return first + nextFour + nextFifteen;
}

function points(score: number, perEffectiveUnit: number): number {
  return Math.trunc((score * perEffectiveUnit) / 100);
}

function canonicalActivity(activity: ClassifiedActivity): string {
  return [
    activity.blockNumber.toString(),
    activity.txHash.toLowerCase(),
    activity.category.toString().padStart(2, "0"),
    activity.units.toString(),
    activity.peerTokenId?.toString() ?? "",
    activity.contract?.toLowerCase() ?? "",
    activity.selector?.toLowerCase() ?? "",
  ].join(":");
}

function buildPersonality(scores: CategoryCounters): PersonalityDeltas {
  const sent = scores[ActivityCategory.TX_SENT];
  const received = scores[ActivityCategory.TX_RECEIVED];
  const calls = scores[ActivityCategory.CONTRACT_CALL];
  const fresh = scores[ActivityCategory.NEW_CONTRACT];
  const repeats = scores[ActivityCategory.REPEAT_CONTRACT];
  const deploys = scores[ActivityCategory.CONTRACT_DEPLOY];
  const unique = scores[ActivityCategory.UNIQUE_COUNTERPARTY];
  const peers = scores[ActivityCategory.REGISTERED_PEER_CONTACT];
  const highGas = scores[ActivityCategory.HIGH_GAS_ACTIVITY];
  const selectors = scores[ActivityCategory.SELECTOR_DIVERSITY];

  return [
    clamp(points(sent, 1) + points(highGas, 2) + points(peers, 1), -MAX_PERSONALITY_DELTA, MAX_PERSONALITY_DELTA),
    clamp(points(calls, 3) + points(fresh, 4) + points(selectors, 5) + points(unique, 2) + points(deploys, 4), -MAX_PERSONALITY_DELTA, MAX_PERSONALITY_DELTA),
    clamp(points(peers, 5) + points(unique, 1) + points(received, 1), -MAX_PERSONALITY_DELTA, MAX_PERSONALITY_DELTA),
    clamp(points(repeats, 2) + points(received, 1) - points(sent, 1), -MAX_PERSONALITY_DELTA, MAX_PERSONALITY_DELTA),
    clamp(points(repeats, 3) - points(highGas, 1) - points(deploys, 2), -MAX_PERSONALITY_DELTA, MAX_PERSONALITY_DELTA),
    clamp(points(highGas, 3) + points(deploys, 4) + points(fresh, 1), -MAX_PERSONALITY_DELTA, MAX_PERSONALITY_DELTA),
    clamp(points(fresh, 3) + points(unique, 2) + points(selectors, 2), -MAX_PERSONALITY_DELTA, MAX_PERSONALITY_DELTA),
    clamp(points(repeats, 2) + points(peers, 3) + points(selectors, 2), -MAX_PERSONALITY_DELTA, MAX_PERSONALITY_DELTA),
  ];
}

function buildNeeds(scores: CategoryCounters): NeedDeltas {
  const sent = scores[ActivityCategory.TX_SENT];
  const received = scores[ActivityCategory.TX_RECEIVED];
  const calls = scores[ActivityCategory.CONTRACT_CALL];
  const deploys = scores[ActivityCategory.CONTRACT_DEPLOY];
  const peers = scores[ActivityCategory.REGISTERED_PEER_CONTACT];
  const highGas = scores[ActivityCategory.HIGH_GAS_ACTIVITY];
  const totalScore = scores.reduce((sum, value) => sum + value, 0);

  return [
    clamp(-(points(sent, 1) + points(received, 1) + points(calls, 1) + points(deploys, 2)), -MAX_NEED_DELTA, MAX_NEED_DELTA),
    clamp(points(peers, 2) + points(received, 1) - points(highGas, 1), -MAX_NEED_DELTA, MAX_NEED_DELTA),
    clamp(-points(totalScore, 3), -MAX_NEED_DELTA, MAX_NEED_DELTA),
    clamp(points(highGas, 4) + points(deploys, 3) + points(sent, 1), -MAX_NEED_DELTA, MAX_NEED_DELTA),
    clamp(-points(peers, 5), -MAX_NEED_DELTA, MAX_NEED_DELTA),
  ];
}

function buildMutationCounters(activities: readonly ClassifiedActivity[]): MutationCounters {
  const result = blankMutationCounters();
  const perBlock = new Map<string, number>();
  const perContract = new Map<string, number>();

  for (const activity of activities) {
    const blockKey = activity.blockNumber.toString();
    perBlock.set(blockKey, (perBlock.get(blockKey) ?? 0) + Math.max(0, activity.units));
    if (activity.contract !== undefined) {
      const key = activity.contract.toLowerCase();
      perContract.set(key, (perContract.get(key) ?? 0) + Math.max(0, activity.units));
    }
  }

  for (const count of perBlock.values()) if (count >= 3) result[0] += 1;
  // Counter 1 (bridge/network-like) is supplied by the durable activity-history classifier.
  // Counter 2 (hostile-social history) is canonicalized by World from social actions.
  for (const count of perContract.values()) if (count >= 2) result[3] += 1;

  return result.map((value) => Math.min(value, MAX_MUTATION_COUNTER)) as MutationCounters;
}

export function aggregateEpoch(
  wallet: Address,
  tokenId: bigint,
  chainId: bigint,
  fromBlock: bigint,
  toBlock: bigint,
  activities: readonly ClassifiedActivity[],
): EpochSummary {
  if (fromBlock > toBlock) throw new Error("invalid epoch block range");

  const rawCounters = blankCounters();
  for (const activity of activities) {
    if (!Number.isSafeInteger(activity.units) || activity.units < 0) throw new Error("activity units must be a non-negative safe integer");
    if (activity.category < 0 || activity.category > ActivityCategory.SELECTOR_DIVERSITY) throw new Error("invalid activity category");
    rawCounters[activity.category] += activity.units;
  }

  const categoryCounters = rawCounters.map((value) => Math.min(value, MAX_CATEGORY_COUNTER)) as CategoryCounters;
  const scores = rawCounters.map(diminishingScore) as CategoryCounters;

  let xp = 0;
  for (let index = 0; index < XP_POINTS.length; index += 1) xp += points(scores[index], XP_POINTS[index]);
  xp = clamp(xp, 0, MAX_XP_DELTA);

  const canonical = activities.map(canonicalActivity).sort();
  const activityDigest = keccak256(toHex(canonical.join("|")));
  const epochId = keccak256(
    encodePacked(["uint256", "address", "uint64", "uint64"], [chainId, wallet, fromBlock, toBlock]),
  );

  return {
    wallet,
    tokenId,
    chainId,
    fromBlock,
    toBlock,
    epochId,
    activityDigest,
    xpDelta: BigInt(xp),
    personalityDeltas: buildPersonality(scores),
    needDeltas: buildNeeds(scores),
    categoryCounters,
    mutationCounters: buildMutationCounters(activities),
  };
}
