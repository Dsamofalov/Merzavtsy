# Merzavtsy MVP Remaining Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Ethereum watcher daemon, persistence, signing/submission pipeline, deployment tooling, Docker packaging, integration/property tests, documentation, and final CI for the Merzavtsy MVP.

**Architecture:** Keep the canonical game state on-chain and implement one modular TypeScript daemon. The daemon observes only finalized blocks, classifies registered-wallet transactions into the exact ten activity counters already used by `MutationRules.sol`, aggregates bounded diminishing-return epochs, signs the existing `ActivityAttestation` EIP-712 schema, submits idempotently, runs public life ticks, and persists operational/indexed state in SQLite through Node 22 `node:sqlite`.

**Tech Stack:** Solidity 0.8.34, Hardhat 3.14, TypeScript 5.9, Node >=22.13, viem 2.56, built-in `node:sqlite`, node:test, Docker Compose, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-28-merzavtsy-design.md`

## Global Constraints

- One creature per registered wallet; identity remains non-transferable.
- Activity categories are fixed in this order: `TX_SENT`, `TX_RECEIVED`, `CONTRACT_CALL`, `NEW_CONTRACT`, `REPEAT_CONTRACT`, `CONTRACT_DEPLOY`, `UNIQUE_COUNTERPARTY`, `REGISTERED_PEER_CONTACT`, `HIGH_GAS_ACTIVITY`, `SELECTOR_DIVERSITY`.
- The watcher never attests chain-tip activity; it processes only blocks at or below `head - finalityDepth`.
- Repeated identical activity receives diminishing returns; all produced deltas must remain below the on-chain oracle caps.
- Epoch IDs and activity digests are deterministic; restart/retry must not create a second canonical epoch.
- The oracle key has gameplay-only authority and is never used as a custody wallet for user assets.
- `lifeTick` remains public and incentive-neutral.
- No project token, marketplace, yield, gambling, paid stat boost, or custody system is introduced.

---

### Task 6: Watcher, classifier, and diminishing-return aggregator

**Files:**
- Create: `daemon/src/types.ts`
- Create: `daemon/src/classifier.ts`
- Create: `daemon/src/aggregator.ts`
- Create: `daemon/src/chain-watcher.ts`
- Test: `daemon/test/classifier.test.ts`
- Test: `daemon/test/aggregator.test.ts`
- Test: `daemon/test/chain-watcher.test.ts`

**Interfaces:**
- `classifyTransaction(tx, context): ClassifiedActivity[]`
- `aggregateEpoch(wallet, tokenId, chainId, fromBlock, toBlock, activities): EpochSummary`
- `finalizedRange(lastProcessedBlock, headBlock, finalityDepth, maxBlocks): { fromBlock; toBlock } | null`
- `ActivityCategory` numeric values must exactly match Solidity counter positions 0..9.

- [ ] Write classifier tests covering plain ETH send/receive, contract call, deployment, repeat/new destination, registered-peer contact, high-gas threshold, and unique selector accounting.
- [ ] Run daemon tests and verify RED because classifier modules do not exist.
- [ ] Implement pure classification without RPC side effects; caller supplies code/existence/registry context.
- [ ] Write aggregator tests proving deterministic epoch IDs, deterministic digests, per-category diminishing returns, bounded XP/personality/need deltas, and input-order independence after canonical sorting.
- [ ] Run tests and verify RED for missing aggregator behavior.
- [ ] Implement integer-only aggregation. Use `effectiveCount = min(count, 1) + min(max(count - 1, 0), 4) / 2 + min(max(count - 5, 0), 15) / 5` represented with integer weights (100, 50, 20) to avoid floating point; clamp output to oracle caps.
- [ ] Write watcher range tests proving no chain-tip processing, empty range when finality is not reached, bounded batch size, and duplicate block rejection.
- [ ] Implement `finalizedRange` and a block-normalization helper with no network calls in unit tests.
- [ ] Run `npm run test:daemon && npm run typecheck` and commit only after GREEN.

### Task 7: SQLite persistence, registry, idempotency, and reorg/finality state

**Files:**
- Create: `daemon/src/store.ts`
- Create: `daemon/src/registry.ts`
- Create: `daemon/src/indexer.ts`
- Test: `daemon/test/store.test.ts`
- Test: `daemon/test/registry.test.ts`

**Interfaces:**
- `new DaemonStore(path)` creates/migrates SQLite schema.
- `store.recordProcessedBlock(blockNumber, blockHash, parentHash)` is idempotent and detects conflicting hashes.
- `store.putEpoch(summary)` uses `(chainId, wallet, fromBlock, toBlock)` and `epochId` uniqueness.
- `store.markEpochSubmitted(epochId, txHash)` is idempotent.
- `registry.applyBorn(owner, tokenId, blockNumber)` and `registry.tokenForWallet(address)`.
- `indexer.recordEvent(log)` stores append-only canonical event metadata.

- [ ] Write in-memory SQLite tests for schema creation, restart persistence, duplicate processed blocks, conflicting block hash detection, unique epochs, and submitted-state recovery.
- [ ] Verify RED before creating persistence code.
- [ ] Implement schema with WAL mode for file-backed DB, `processed_blocks`, `registry`, `epochs`, `contract_destinations`, `selectors`, `events`, and `meta` tables. Use prepared statements and transactions around block commits.
- [ ] Write registry tests for Born replay/idempotency and wallet/token lookup.
- [ ] Implement registry as a thin store-backed module; no separate mutable cache is authoritative.
- [ ] Write indexer test proving duplicate `(txHash, logIndex)` events are ignored while different log indexes are retained.
- [ ] Run daemon tests/typecheck and commit after GREEN.

### Task 8: EIP-712 signer, submitter, and life keeper

**Files:**
- Create: `daemon/src/attestation.ts`
- Create: `daemon/src/submitter.ts`
- Create: `daemon/src/life-keeper.ts`
- Test: `daemon/test/attestation.test.ts`
- Test: `daemon/test/submitter.test.ts`
- Test: `daemon/test/life-keeper.test.ts`

**Interfaces:**
- `buildAttestation(summary, nonce, deadline): ActivityAttestation`
- `signAttestation(account, oracleAddress, attestation): Promise<Hex>` uses domain `{ name: "Merzavtsy Activity Oracle", version: "1", chainId, verifyingContract }` and the exact Solidity field order/types.
- `submitPendingEpochs(deps): Promise<SubmitResult[]>` skips already-submitted epochs and persists tx hash only after receipt success.
- `dueLifeTicks(states, now): bigint[]` selects initialized non-cooled-down tokens and does not reward caller.

- [ ] Write a signing fixture whose signature is recoverable to the configured oracle account with viem `recoverTypedDataAddress`.
- [ ] Verify RED, then implement exact typed-data schema shared from one constant.
- [ ] Write submitter tests for success, transient retry, crash-after-broadcast recovery, and already-consumed/duplicate epoch handling using dependency-injected transport functions rather than a mocked internal implementation.
- [ ] Implement bounded retry with deterministic epoch lookup; never generate a new nonce/epoch when retrying the same persisted epoch.
- [ ] Write keeper tests for cooldown boundary and hibernating creatures; keeper may tick hibernating creatures because the contract itself suppresses social intent.
- [ ] Implement selection logic and run daemon tests/typecheck to GREEN.

### Task 9: Registered-peer encounters and end-to-end local integration

**Files:**
- Modify: `contracts/interfaces/IMerzavetsWorld.sol`
- Modify: `contracts/MerzavetsWorld.sol`
- Modify: `contracts/ActivityOracle.sol`
- Create: `test/PeerActivity.test.ts`
- Create: `test/Integration.test.ts`
- Modify: `daemon/src/classifier.ts`
- Modify: `daemon/src/aggregator.ts`

**Interfaces:**
- Extend attestation with `peerTokenId` only if non-zero peer contact is present, or add a separate bounded `PeerAttestation` EIP-712 entrypoint if doing so preserves existing schema compatibility more cleanly.
- A verified direct transaction between registered owners must be able to change directional relationship state without allowing arbitrary public callers to forge watcher-derived peer contact.

- [ ] Write RED contract test proving arbitrary users cannot forge watcher-derived peer relationship changes.
- [ ] Write RED test proving a valid oracle-signed peer contact changes a bounded directional relationship and consumes replay guards.
- [ ] Implement the smallest oracle-authorized peer pathway; reuse existing caps/replay infrastructure and keep user-initiated `socialize` separate.
- [ ] Write integration test: deploy identity/world/oracle; birth A/B; construct raw A→B transfer fixture; classify; aggregate; sign; submit; assert XP/counters update; assert A→B relationship changes; advance time; call `lifeTick`; assert structured life event/state change.
- [ ] Run all contract and daemon tests plus typecheck to GREEN.

### Task 10: Runtime service, deployment CLI, and Docker Compose

**Files:**
- Create: `daemon/src/config.ts`
- Create: `daemon/src/service.ts`
- Create: `daemon/src/main.ts`
- Create: `scripts/deploy.ts`
- Create: `scripts/status.ts`
- Create: `.env.example`
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Test: `daemon/test/config.test.ts`

**Interfaces:**
- Required runtime config: `RPC_URL`, `CHAIN_ID`, `IDENTITY_ADDRESS`, `WORLD_ADDRESS`, `ORACLE_ADDRESS`, `ORACLE_PRIVATE_KEY`, `SUBMITTER_PRIVATE_KEY`, `DB_PATH`, `FINALITY_DEPTH`, `EPOCH_BLOCKS`, `POLL_INTERVAL_MS`.
- Deployment writes `deployments/<chainId>.json` with identity/world/oracle addresses and deployment block.
- `npm run daemon` starts the loop; `npm run status -- --chain-id N` prints deployment/runtime state.

- [ ] Write RED config validation tests for missing/invalid chain ID, addresses, keys, finality depth, and poll interval.
- [ ] Implement strict parsing with no silent defaults for secrets or chain identity; permit safe operational defaults only for DB path/polling/finality in local mode.
- [ ] Implement service loop in explicit phases: sync registry/indexer → finalized blocks → aggregate/persist epochs → sign → submit → life keeper.
- [ ] Add graceful SIGINT/SIGTERM close of SQLite and no overlapping loop iterations.
- [ ] Add deploy/status scripts and package scripts.
- [ ] Add non-root Docker image and compose volume for SQLite; do not bake secrets into image.
- [ ] Run typecheck/tests and validate workflow syntax through CI.

### Task 11: Property/security regression suite

**Files:**
- Create: `test/Properties.test.ts`
- Create: `daemon/test/properties.test.ts`
- Modify: `.github/workflows/bootstrap-lock.yml`

**Interfaces:**
- Deterministic generated cases use a fixed test seed and hundreds of bounded inputs; no external fuzz dependency is required.

- [ ] Add contract property loops proving stats remain 0..10000, XP never decreases, relationship values never overflow, consumed digest/epoch/nonce cannot be replayed, and repeated `lifeTick` before cooldown cannot mutate state.
- [ ] Add daemon generated cases proving aggregation determinism, output caps, duplicate block idempotency, and epoch identity stability across restart.
- [ ] Add `npm audit --audit-level=high` as a non-network-independent release gate only where the runner has registry access; high/critical findings fail CI, existing low findings do not.
- [ ] Rename workflow/job to final `ci`/`verify`; run `npm run verify` in CI from locked dependencies.
- [ ] Verify full suite GREEN.

### Task 12: Documentation, operational runbook, and final branch verification

**Files:**
- Create: `README.md`
- Create: `CONCEPT.md`
- Create: `docs/OPERATIONS.md`
- Create: `docs/SECURITY.md`
- Modify: `docs/superpowers/specs/2026-08-28-merzavtsy-design.md` only if implementation-level decisions require clarification without changing approved product scope.

**Interfaces:**
- README contains local install, test, deploy, daemon, Docker, and Sepolia instructions.
- SECURITY documents oracle-key blast radius, finality assumptions, replay model, signer/submitter separation, no-custody guarantee, and explicitly states external smart-contract audit happens after feature-complete MVP and before production mainnet use.

- [ ] Document architecture and exact category index mapping.
- [ ] Document SQLite backup/recovery and deep-reorg operational response: alert and stop automatic biography rewriting after an already-attested deep reorg.
- [ ] Document key separation and rotation procedure supported by current contracts; if rotation is not yet supported safely, add a RED test and the minimal owner-controlled signer-role rotation before documenting it.
- [ ] Run clean `npm ci`, `npm run verify`, and Docker build in CI.
- [ ] Inspect PR diff for secrets, generated artifacts, accidental scope expansion, and unsafe writable CI permissions.
- [ ] Use `verification-before-completion`, then `finishing-a-development-branch`; keep PR draft until every required gate is GREEN.