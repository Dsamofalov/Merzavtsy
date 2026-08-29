import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recoverTypedDataAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  PEER_TYPES,
  buildPeerAttestation,
  signPeerAttestation,
} from "../src/peer-attestation.js";
import { activityDomain } from "../src/attestation.js";

const PRIVATE_KEY = `0x${"12".repeat(32)}` as Hex;
const ORACLE = "0x9000000000000000000000000000000000000009" as Address;
const ALICE = "0x1000000000000000000000000000000000000001" as Address;
const BOB = "0x2000000000000000000000000000000000000002" as Address;

describe("peer attestation signing", () => {
  it("recovers the signer under the same oracle domain with a separate primary type", async () => {
    const account = privateKeyToAccount(PRIVATE_KEY);
    const peer = buildPeerAttestation(
      {
        actorWallet: ALICE,
        actorTokenId: 1n,
        peerWallet: BOB,
        peerTokenId: 2n,
        chainId: 31337n,
        blockNumber: 100n,
        encounterDigest: `0x${"44".repeat(32)}` as Hex,
      },
      3n,
      1_900_000_000n,
    );

    const signature = await signPeerAttestation(account, ORACLE, peer);
    const recovered = await recoverTypedDataAddress({
      domain: activityDomain(peer.chainId, ORACLE),
      types: PEER_TYPES,
      primaryType: "PeerAttestation",
      message: peer,
      signature,
    });

    assert.equal(recovered.toLowerCase(), account.address.toLowerCase());
    assert.equal(peer.nonce, 3n);
    assert.equal(peer.peerTokenId, 2n);
  });
});
