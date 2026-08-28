# Daemon storage boundary

## MVP decision

Merzavtsy uses **SQLite** as the durable local index store for the first deployable release. This matches the approved design's requirement for one local index store and keeps crash recovery, replay protection, registry state, indexed events, signed-envelope archive, and operational fail-stop state in one transactional database.

A **PostgreSQL** adapter is **not required** for the MVP and is intentionally out of scope for the first deployable release. The canonical gameplay state remains Ethereum; the local database is a reproducible operational/indexing layer, not a second source of truth for ownership or canonical creature state.

## What SQLite stores

The daemon persists data needed to resume safely and reconstruct derived views, including:

- processed finalized block hashes/cursors;
- registered wallet/token mappings;
- seen contracts, selectors, and counterparties;
- closed epoch summaries and submission state;
- peer encounter submission state;
- indexed structured events;
- signed public attestation envelopes;
- activity-history/anti-spam state;
- deep-reorg fail-stop state.

Writes that must advance together are transactional. File-backed operation uses WAL mode.

## Reproduction and portability

The database is not the only copy of canonical facts. A fresh local index can be rebuilt from:

1. the deployment metadata;
2. finalized Ethereum history from the configured deployment block;
3. deterministic classifier/aggregation rules;
4. archived/public signed attestations for comparison and audit.

The procedure is documented in `docs/REPRODUCIBILITY.md`.

For migrations or analytics, structured data can be exported before replacing the storage implementation. Stable identifiers such as chain ID, block number/hash, transaction/log identity, `epochId`, `activityDigest`, token ID, and encounter digest must remain unchanged across backends.

## Future PostgreSQL path

If multi-instance operation, larger public analytics, or service-level availability requires PostgreSQL later, introduce it behind the same narrow store semantics rather than changing gameplay rules. A migration should:

1. define backend-independent store interfaces for the remaining SQLite-specific call sites;
2. reproduce uniqueness/idempotency constraints in PostgreSQL;
3. preserve transaction boundaries used for cursor + derived-state commits;
4. replay the same fixture/history into SQLite and PostgreSQL and compare deterministic outputs;
5. verify crash-after-broadcast recovery and deep-reorg fail-stop behavior on both backends;
6. migrate operational data only after a checked export and reconciliation report.

No PostgreSQL requirement is allowed to delay or silently change the MVP's canonical Ethereum rules.
