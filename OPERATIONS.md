# Merzavtsy operations runbook

## Routine startup

1. Keep `.env` outside version control and use distinct oracle and submitter keys.
2. Confirm `deployments/<CHAIN_ID>.json` matches the intended network.
3. Run `npm run status`; do not start the daemon when chain, bytecode or wiring validation fails.
4. Start with `npm run daemon` or `docker compose up --build`.
5. Ensure `DB_PATH` is persistent. A disposable SQLite volume destroys restart/idempotency state.

The daemon emits structured JSON records. Normal operational signals include `chain_progress`, `registered_wallet_count`, `epoch_opened`, `activities_classified`, `epoch_closed`, `attestation_signed`, `submitted_tx`, `replay_skip` and `keeper_tick_result`. `rpc_failed` and `reorg_detected` require attention.

## RPC failures

A transient RPC failure aborts the current phase rather than partially advancing the durable cursor. Inspect the redacted `rpc_failed` record and provider health. Do not manually edit the cursor to skip an unavailable block. Once the provider is healthy, restart or allow the next polling iteration to retry.

If a transaction hash was already persisted, the submitter resumes receipt lookup after restart; it must not sign and broadcast a replacement transaction just because receipt lookup temporarily failed.

## Deep reorg / finalized parent mismatch

A **deep reorg** means the first newly observed finalized block does not point to the hash of the previously persisted finalized block. This is exceptional because epochs for the old history may already have been signed or submitted.

The daemon therefore follows a fail-stop policy:

- emit `reorg_detected` with the expected and observed parent hashes;
- persist the fail-stop marker in the durable SQLite operational journal;
- throw the current iteration;
- refuse future registry/indexer iterations while the marker remains engaged;
- never automatically rewind already-attested history.

Check status:

```bash
npm run reorg:status
```

### Recovery procedure

Do **not** clear the fail-stop merely to restart the service.

1. Stop all daemon instances that share the deployment/database.
2. Back up the SQLite database and deployment metadata.
3. Verify the canonical chain with an independent RPC/provider or explorer.
4. Identify the divergence point and determine whether any affected epoch or peer encounter was signed, broadcast or consumed on-chain.
5. Preserve all relevant tx hashes, epoch IDs, encounter digests, block hashes and timestamps for incident records.
6. Rebuild or restore daemon state from the last trusted canonical point using an operator-reviewed procedure. Never delete on-chain replay evidence.
7. Run `npm run status` and verify chain ID, bytecode and contract wiring again.
8. Only after canonical state is recovered, clear the marker with the exact acknowledgement below.

```bash
ACKNOWLEDGE_DEEP_REORG=I_HAVE_RECOVERED_CANONICAL_STATE npm run reorg:clear
```

Any other acknowledgement value is rejected. After clearing, run `npm run reorg:status` and confirm `engaged` is false before restarting the daemon.

If already-consumed on-chain attestations conflict with the reconstructed canonical history, do not invent compensating activity. Keep the daemon stopped and escalate for protocol-level review; automatic rollback is intentionally outside the MVP.

## Key incident

If an oracle key may be compromised, pause the oracle contract using the authorized admin account and revoke/replace signer authority according to the deployed role configuration. Keep the submitter separate: compromise of a gas-paying submitter must not imply oracle-signing authority.

If a submitter key may be compromised, stop the daemon, rotate the funded submitter account/configuration, and inspect pending persisted tx hashes before resuming. Do not discard persisted in-flight hashes.

## Database incident

SQLite uses durable idempotency state. Before repair:

- stop all writers;
- copy the database and WAL files together;
- never hand-edit submitted/consumed flags merely to force a retry;
- verify pending/broadcast state against chain receipts;
- preserve the operational fail-stop journal.

## Sepolia deployment proof workflow

The repository ships a manually gated GitHub Actions workflow at `.github/workflows/sepolia-proof.yml`. It is intentionally separate from pull-request CI because it spends Sepolia ETH and requires deployment credentials.

Before the first run, configure the GitHub Actions `sepolia` environment with these secrets:

- `SEPOLIA_RPC_URL` — an HTTPS/WSS-capable Sepolia JSON-RPC endpoint accepted by the deployment scripts;
- `SEPOLIA_DEPLOYER_PRIVATE_KEY` — a funded Sepolia-only deployment key. Do not reuse a production mainnet key.

Start the `sepolia-proof` workflow manually and provide `oracle_signer_address`, a non-zero Sepolia address that should receive the initial `ORACLE_SIGNER_ROLE`. The workflow pins `CHAIN_ID=11155111`, runs the full repository verification gate first, deploys `Merzavets`, `MerzavetsWorld` and `ActivityOracle`, runs `npm run smoke:sepolia`, and fails closed on chain/topology mismatch.

A successful run uploads one immutable evidence bundle containing:

- `proofs/sepolia-smoke.json` — healthy-chain smoke proof produced by the repository command;
- `deployments/11155111.json` — exact deployed contract addresses and deployment block;
- `proofs/SHA256SUMS` — hashes binding the deployment metadata and smoke proof;
- `proofs/github-run.json` — repository, commit SHA, ref, Actions run ID/attempt and generation timestamp.

Keep the successful Actions run URL and downloaded artifact with the release record. A repository-side test or a locally fabricated JSON file is **not** equivalent to this external Sepolia proof.

## External smart-contract audit gate

Repository CI, property tests, secret scanning and an internal code review are prerequisites, not substitutes for an independent smart-contract audit. Before production mainnet release, provide the auditor the exact release commit SHA plus `contracts/`, `ARCHITECTURE.md`, `SECURITY.md`, `OPERATIONS.md` and the successful Sepolia proof bundle. Freeze contract-changing commits during audit or require all post-audit contract changes to be explicitly reviewed as audit deltas.

Do not mark the external-audit release gate complete until an independent reviewer/auditor has delivered a report for the exact release scope and all critical/high findings are either fixed and re-reviewed or explicitly accepted by the release owner.

## Rollout order

Use local development first, then Sepolia, then mainnet. A mainnet deployment should be blocked until a Sepolia end-to-end run has evidence for birth, activity classification, signed/submitted attestation, replay rejection, restart persistence and autonomous life.
