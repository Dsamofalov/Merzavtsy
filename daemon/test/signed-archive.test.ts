import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { Address, Hex } from "viem";
import { archiveSignedActivity, signedActivityArchive } from "../src/signed-archive.js";
import { DaemonStore } from "../src/store.js";
import type { SignedActivity } from "../src/submitter.js";

const wallet = "0x1111111111111111111111111111111111111111" as Address;
const hex = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;

function signed(): SignedActivity {
  return {
    attestation: {
      wallet,
      tokenId: 1n,
      chainId: 1n,
      fromBlock: 100n,
      toBlock: 120n,
      epochId: hex(1),
      activityDigest: hex(2),
      xpDelta: 33n,
      personalityDeltas: [1,2,3,4,5,6,7,8],
      needDeltas: [1,2,3,4,5],
      categoryCounters: [1,2,3,4,5,6,7,8,9,10],
      nonce: 7n,
      deadline: 9_999n,
    },
    signature: `0x${"ab".repeat(65)}` as Hex,
  };
}

describe("signed payload archive", () => {
  it("stores one auditable signed envelope idempotently and survives restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "merzavtsy-signed-"));
    const path = join(dir, "daemon.sqlite");
    try {
      let store = new DaemonStore(path);
      assert.equal(archiveSignedActivity(store, signed()), true);
      assert.equal(archiveSignedActivity(store, signed()), false);
      store.close();

      store = new DaemonStore(path);
      const archived = signedActivityArchive(store);
      assert.equal(archived.length, 1);
      assert.equal(archived[0]!.attestation.epochId, hex(1));
      assert.equal(archived[0]!.attestation.xpDelta, 33n);
      assert.equal(archived[0]!.signature, signed().signature);
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
