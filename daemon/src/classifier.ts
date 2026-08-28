import type { Address, Hex } from "viem";
import {
  ActivityCategory,
  type ClassifiedActivity,
  type ClassifierContext,
  type ObservedTransaction,
} from "./types.js";

export { ActivityCategory } from "./types.js";

function lower(address: Address): string {
  return address.toLowerCase();
}

function selectorOf(input: Hex): Hex | null {
  if (input.length < 10) return null;
  return input.slice(0, 10) as Hex;
}

function push(
  result: ClassifiedActivity[],
  tx: ObservedTransaction,
  category: ActivityCategory,
  extras: Pick<ClassifiedActivity, "peerTokenId" | "contract" | "selector"> = {},
): void {
  result.push({
    category,
    units: 1,
    blockNumber: tx.blockNumber,
    txHash: tx.txHash,
    ...extras,
  });
}

/**
 * Classify one finalized transaction from the perspective of one registered
 * wallet. The function is deliberately pure: RPC-derived facts such as
 * destination code and previously-seen sets are supplied by the caller.
 */
export function classifyTransaction(
  tx: ObservedTransaction,
  context: ClassifierContext,
): ClassifiedActivity[] {
  const result: ClassifiedActivity[] = [];
  const wallet = lower(context.wallet);
  const from = lower(tx.from);
  const to = tx.to === null ? null : lower(tx.to);
  const outgoing = from === wallet;
  const incoming = to === wallet;

  if (!outgoing && !incoming) return result;

  const minimumMeaningfulWei = context.minimumMeaningfulWei ?? 0n;
  if (minimumMeaningfulWei < 0n) throw new Error("minimumMeaningfulWei must be non-negative");
  const valueMeaningful = tx.value >= minimumMeaningfulWei;
  const contractOrDeployment = outgoing && (tx.to === null || context.destinationHasCode);
  const transferProgression = valueMeaningful || contractOrDeployment;

  if (outgoing && transferProgression) push(result, tx, ActivityCategory.TX_SENT);
  if (incoming && valueMeaningful) push(result, tx, ActivityCategory.TX_RECEIVED);

  const counterparty = outgoing ? tx.to : tx.from;
  if (counterparty !== null) {
    const counterpartyKey = lower(counterparty);
    if (transferProgression && !context.seenCounterparties.has(counterpartyKey)) {
      push(result, tx, ActivityCategory.UNIQUE_COUNTERPARTY);
    }

    const peerTokenId = context.registeredPeers.get(counterpartyKey);
    if (peerTokenId !== undefined) {
      // Registered-peer contact remains observable for biography even when the
      // transferred amount is below the plain-ETH progression threshold.
      push(result, tx, ActivityCategory.REGISTERED_PEER_CONTACT, { peerTokenId });
    }
  }

  if (tx.gasUsed >= context.highGasThreshold) {
    push(result, tx, ActivityCategory.HIGH_GAS_ACTIVITY);
  }

  if (outgoing && tx.to === null) {
    push(result, tx, ActivityCategory.CONTRACT_DEPLOY, {
      ...(tx.createdContract === null ? {} : { contract: tx.createdContract }),
    });
    return result;
  }

  if (outgoing && tx.to !== null && context.destinationHasCode) {
    const contractKey = lower(tx.to);
    push(result, tx, ActivityCategory.CONTRACT_CALL, { contract: tx.to });

    if (context.seenContracts.has(contractKey)) {
      push(result, tx, ActivityCategory.REPEAT_CONTRACT, { contract: tx.to });
    } else {
      push(result, tx, ActivityCategory.NEW_CONTRACT, { contract: tx.to });
    }

    const selector = selectorOf(tx.input);
    if (selector !== null && !context.seenSelectors.has(selector.toLowerCase())) {
      push(result, tx, ActivityCategory.SELECTOR_DIVERSITY, {
        contract: tx.to,
        selector,
      });
    }
  }

  return result;
}