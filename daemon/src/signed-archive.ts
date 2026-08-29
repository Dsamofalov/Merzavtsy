import { keccak256, toHex, type Address, type Hex } from "viem";
import type { ActivityAttestation } from "./attestation.js";
import { DaemonStore } from "./store.js";
import type { SignedActivity } from "./submitter.js";
import type { CategoryCounters, NeedDeltas, PersonalityDeltas } from "./types.js";

const ARCHIVE_TX = keccak256(toHex("MERZAVTSY_SIGNED_ACTIVITY_ARCHIVE_V1"));
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const ARCHIVE_EVENT = "__signed_activity_attestation";

function payloadOf(signed: SignedActivity): Record<string, unknown> {
  const value = signed.attestation;
  return {
    wallet: value.wallet.toLowerCase(),
    tokenId: value.tokenId.toString(),
    chainId: value.chainId.toString(),
    fromBlock: value.fromBlock.toString(),
    toBlock: value.toBlock.toString(),
    epochId: value.epochId.toLowerCase(),
    activityDigest: value.activityDigest.toLowerCase(),
    xpDelta: value.xpDelta.toString(),
    personalityDeltas: value.personalityDeltas,
    needDeltas: value.needDeltas,
    categoryCounters: value.categoryCounters,
    nonce: value.nonce.toString(),
    deadline: value.deadline.toString(),
    signature: signed.signature.toLowerCase(),
  };
}

function signedOf(payload: Record<string, unknown>): SignedActivity {
  const required = (name: string): string => {
    const value = payload[name];
    if (typeof value !== "string") throw new Error(`corrupt signed archive field ${name}`);
    return value;
  };
  const numberArray = (name: string, length: number): number[] => {
    const value = payload[name];
    if (!Array.isArray(value) || value.length !== length || value.some((item) => typeof item !== "number")) {
      throw new Error(`corrupt signed archive field ${name}`);
    }
    return value as number[];
  };

  const attestation: ActivityAttestation = {
    wallet: required("wallet") as Address,
    tokenId: BigInt(required("tokenId")),
    chainId: BigInt(required("chainId")),
    fromBlock: BigInt(required("fromBlock")),
    toBlock: BigInt(required("toBlock")),
    epochId: required("epochId") as Hex,
    activityDigest: required("activityDigest") as Hex,
    xpDelta: BigInt(required("xpDelta")),
    personalityDeltas: numberArray("personalityDeltas", 8) as PersonalityDeltas,
    needDeltas: numberArray("needDeltas", 5) as NeedDeltas,
    categoryCounters: numberArray("categoryCounters", 10) as CategoryCounters,
    nonce: BigInt(required("nonce")),
    deadline: BigInt(required("deadline")),
  };
  return { attestation, signature: required("signature") as Hex };
}

export function archiveSignedActivity(store: DaemonStore, signed: SignedActivity): boolean {
  const archived = store.eventsForTransaction(ARCHIVE_TX).filter((event) => event.eventName === ARCHIVE_EVENT);
  const epochId = signed.attestation.epochId.toLowerCase();
  const existing = archived.find((event) => String(event.payload.epochId).toLowerCase() === epochId);
  const payload = payloadOf(signed);
  if (existing !== undefined) {
    if (JSON.stringify(existing.payload) !== JSON.stringify(payload)) {
      throw new Error(`signed archive conflict for ${signed.attestation.epochId}`);
    }
    return false;
  }
  return store.recordEvent({
    txHash: ARCHIVE_TX,
    logIndex: archived.length,
    blockNumber: signed.attestation.toBlock,
    address: ZERO_ADDRESS,
    eventName: ARCHIVE_EVENT,
    payload,
  });
}

export function signedActivityArchive(store: DaemonStore): SignedActivity[] {
  return store.eventsForTransaction(ARCHIVE_TX)
    .filter((event) => event.eventName === ARCHIVE_EVENT)
    .map((event) => signedOf(event.payload));
}
