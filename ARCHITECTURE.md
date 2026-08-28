# Merzavtsy architecture

## Components

### On-chain identity — `Merzavets`

The identity contract creates at most one creature per Ethereum account. A birth stores immutable genome/birth data and mints a locked ERC-721-compatible identity. Existing tokens cannot be transferred or burned. The identity is wired to one world contract exactly once.

### On-chain state machine — `MerzavetsWorld`

The world owns canonical gameplay state: XP/level, age stage, eight personality axes, needs, hibernation, activity counters, mutations, scars, directional relationships, social milestones and autonomous life state. All bounded state uses explicit clamps. Autonomous `lifeTick` is permissionless, deterministic and cooldown-gated.

### Verification boundary — `ActivityOracle`

The oracle verifies **EIP-712** attestations for finalized wallet epochs, mutation metrics and registered-peer encounters. It checks chain identity, wallet/token ownership, signer role, deadlines, bounds, nonces, block ranges, epoch/digest replay state and pause state before forwarding bounded updates to the world.

Oracle authority is intentionally narrow: there is no arbitrary target, calldata or value field in the attestation surface. The oracle cannot use an attestation to call an ERC-20 or transfer user ETH.

## Off-chain daemon

The TypeScript/viem daemon turns finalized Ethereum observations into deterministic attestations:

1. Validate configured chain ID, deployed bytecode and identity/world/oracle wiring.
2. Read `Born` events and maintain the registered wallet/token mapping.
3. Choose only blocks outside the configured finality depth.
4. Fetch complete blocks and receipts and normalize them into canonical observations.
5. Verify parent-hash continuity against both the fetched batch and the durable previous block.
6. Classify wallet activity and registered-peer encounters.
7. Aggregate deterministic block ranges into bounded epochs with diminishing returns.
8. Persist epochs, encounters, seen-state and processed-block metadata atomically in **SQLite**.
9. Sign gameplay payloads with the oracle key.
10. Broadcast them with a separate submitter key and recover idempotently after crashes.
11. Run eligible autonomous life ticks.

## Durable state and restart semantics

SQLite is the correctness boundary for daemon restarts. The store preserves:

- processed finalized blocks;
- wallet/token registry;
- classified seen-contract/selector/counterparty state;
- indexed events;
- closed activity epochs;
- peer encounters;
- broadcast transaction hashes before receipt completion;
- submitted/consumed status;
- an operational journal for processed-block hashes and deep-reorg fail-stop state.

A broadcast hash is persisted before receipt waiting. After a crash, the daemon resumes receipt tracking instead of signing or broadcasting a replacement transaction. On-chain digest/epoch/nonce checks provide a second replay barrier.

## Finality and reorg policy

Normal shallow reorg risk is reduced by waiting `FINALITY_DEPTH` blocks before classification. Every fetched batch must be contiguous, and each parent hash must match the previous block. The first block of a new batch is also checked against the hash of the previously persisted finalized block.

A mismatch at that durable boundary is treated as an exceptional **deep reorg**. The daemon records an error event, engages a durable fail-stop and refuses later iterations. Recovery is intentionally manual because already-issued attestations can make automatic rollback unsafe. See `OPERATIONS.md`.

## Trust boundaries

- **User account:** owns the soulbound creature; normal wallet assets remain outside the game contracts.
- **Oracle signer:** can sign bounded gameplay facts only. It should not hold the submitter role/key.
- **Submitter:** pays gas and broadcasts already-signed payloads; it cannot mint oracle authority.
- **Deployer/admin:** wires immutable contract topology and manages oracle signer/pause roles. Operational policy should minimize continued exposure.
- **RPC provider:** supplies observations, but finality, parent continuity, deterministic aggregation and on-chain replay checks limit what one malformed response can do.

## Observability

Runtime events are structured JSON. Signals include chain progress, registered-wallet count, epoch lifecycle, classification totals, attestation signing, submitted tx hashes, replay skips, RPC failures, reorg detection and keeper outcomes. Secret-bearing field names and common credential assignments are redacted. Transaction hashes and gameplay identifiers remain visible for operations.

## Deployment topology

Each network has one canonical metadata file: `deployments/<CHAIN_ID>.json`, containing chain ID, identity/world/oracle addresses, deployment block and timestamp. Runtime bootstrap refuses chain/address/bytecode/wiring mismatches before opening the persistent database.
