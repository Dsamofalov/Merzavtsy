import type { Address } from "viem";
import {
  activityMerkleRoot,
  auditActivityFeed,
  buildOpenActivityFeed,
  parseAuditSignerAllowlist,
} from "../daemon/src/activity-feed.js";
import { signedActivityArchive } from "../daemon/src/signed-archive.js";
import { DaemonStore } from "../daemon/src/store.js";

function addressEnv(name: string): Address {
  const value = process.env[name]?.trim();
  if (value === undefined || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${name} must be a 20-byte hex address`);
  }
  return value as Address;
}

const dbPath = process.env.DB_PATH?.trim() || "daemon/data/merzavtsy.sqlite";
const oracleAddress = addressEnv("ORACLE_ADDRESS");
const allowedSigners = parseAuditSignerAllowlist(process.env);

const store = new DaemonStore(dbPath);
try {
  const archive = signedActivityArchive(store);
  const feed = await buildOpenActivityFeed(archive, oracleAddress, allowedSigners);
  const findings = auditActivityFeed(feed);
  const report = {
    entries: feed.length,
    validEntries: feed.filter((entry) => entry.valid).length,
    merkleRoot: activityMerkleRoot(feed),
    authorizedSigners: allowedSigners,
    findings,
    feed: feed.map((entry) => ({
      wallet: entry.attestation.wallet,
      tokenId: entry.attestation.tokenId,
      chainId: entry.attestation.chainId,
      fromBlock: entry.attestation.fromBlock,
      toBlock: entry.attestation.toBlock,
      epochId: entry.attestation.epochId,
      activityDigest: entry.attestation.activityDigest,
      signer: entry.signer,
      valid: entry.valid,
      leaf: entry.leaf,
      signature: entry.signature,
    })),
  };
  console.log(JSON.stringify(report, (_key, value: unknown) => typeof value === "bigint" ? value.toString() : value, 2));
  if (findings.length > 0) process.exitCode = 1;
} finally {
  store.close();
}
