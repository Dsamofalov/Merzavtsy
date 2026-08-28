# Canonical reproduction, replay, and crash recovery

Merzavtsy treats Ethereum plus accepted signed gameplay facts as the canonical source of biography. This document defines how an operator reproduces daemon state and audits recovery after a crash without silently rewriting history.

## Reproduction boundary

A closed activity epoch is identified by stable inputs including chain ID, wallet, token ID, and block range. Its `epochId` and `activityDigest` are deterministic. Once accepted, that range is immutable from the game perspective.

The daemon persists before advancing durable cursors. Signed payloads are archived before broadcast, and a broadcast transaction hash is persisted before receipt lookup. On restart, an unresolved broadcast is tracked to completion instead of being replaced with a second transaction.

## Fresh replay procedure

1. Preserve the deployment metadata for the target chain.
2. Stop the daemon and copy the SQLite database if investigating an existing run.
3. For a clean reproduction, start with a new database path.
4. Start the daemon from the deployment block with the same chain ID, finality depth, epoch size, and meaningful-value threshold.
5. Allow the registry/indexer to rebuild finalized observations.
6. Compare reconstructed `epochId` / `activityDigest` values with the archived signed envelopes.
7. Export and audit signed attestations:

```bash
npm run export:attestations
npm run audit:attestations
```

The same finalized input set must produce the same classifier/aggregation digest. Differences are treated as an operational defect, not as an excuse to rewrite an already accepted biography.

## Crash/restart recovery

For activity and peer submissions the durable state machine distinguishes:

- pending and not yet signed/broadcast;
- broadcast hash persisted, receipt unresolved;
- submitted successfully;
- already consumed on-chain;
- reverted / eligible for explicit retry under the existing replay protections.

After a crash, restart the same daemon configuration. It must first inspect persisted broadcast hashes and on-chain consumed state. It must not create a replacement transaction while a prior broadcast remains unresolved.

## Reorg handling

The watcher only closes finalized ranges according to configured finality depth. A conflicting durable parent/hash after that boundary triggers the deep-reorg fail-stop instead of automatic biography rewriting.

Use:

```bash
npm run reorg:status
```

Clear the fail-stop only after operator investigation and the exact acknowledgement procedure documented in `OPERATIONS.md`.

## Determinism checks

The repository regression suite covers:

- deterministic aggregation independent of input order;
- epoch/digest replay protection;
- crash-after-broadcast recovery;
- duplicate block observation;
- persistent registry/history across restart;
- bounded property sequences;
- finality and deep-reorg fail-stop behavior.

A real Sepolia observation is tracked separately in `docs/SEPOLIA_SMOKE.md`; local replay correctness must not be represented as a live testnet proof.
