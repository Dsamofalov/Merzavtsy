# Merzavtsy security

## Asset-safety boundary

Merzavtsy is non-custodial. The MVP contracts do not escrow user ETH, accept deposits, expose a marketplace or execute arbitrary user-selected calls. Activity attestations contain bounded gameplay data only and forward to fixed world entrypoints. The oracle has no payload field that can select an arbitrary contract, calldata blob or ETH value.

The soulbound creature also cannot be transferred or burned through the normal ERC-721 surface. Game progression is non-financial: XP, stages, mutations, scars and relationships do not represent withdrawable value.

## Key separation

Use separate credentials for separate powers:

- `ORACLE_PRIVATE_KEY` — signs EIP-712 gameplay attestations only.
- `SUBMITTER_PRIVATE_KEY` — broadcasts transactions and pays gas; it should not have oracle signer authority.
- `DEPLOYER_PRIVATE_KEY` — deployment/admin work; keep offline or minimally exposed after rollout.
- `BIRTH_PRIVATE_KEY` — an account explicitly choosing to birth its own creature through the operator CLI.

The runtime configuration rejects identical oracle and submitter private keys. Never place real keys in repository files, Docker images, command examples, logs or issue trackers.

## Attestation defenses

`ActivityOracle` validates chain ID, wallet/token ownership, signer role, deadline, input caps, block ranges, nonces and replay state before applying an update. Activity digests and epochs are single-use. Registered-peer encounters use a separate typed payload and replay namespace.

The daemon only signs observations outside configured finality depth, persists closed epochs before submission and records broadcast tx hashes before waiting for receipts. Restart therefore resumes known work instead of creating replacement attestations blindly.

## Reorg defense

Waiting for finality reduces ordinary reorg exposure but cannot make deep reorgs impossible. The watcher checks every internal parent link and the first new finalized block against the durable previous block hash. A mismatch produces `reorg_detected`, persists a fail-stop and blocks future processing until an operator completes the recovery procedure in `OPERATIONS.md`.

## Logging and redaction

Production observability is structured JSON. Secret-bearing field names such as private keys, passwords, authorization, cookies, API keys, tokens and RPC URLs are replaced with `[REDACTED]`. Common inline environment assignments are redacted from error messages as well. Transaction hashes, token IDs, epoch IDs and block identifiers remain visible for debugging.

Redaction is defense in depth. Code should still avoid passing secret values to the logger in the first place. Never log signatures or private-key material intentionally.

## Dependency audit status

CI executes `npm audit --audit-level=high`. At the time this document was introduced, the locked development tree reported 11 **low-severity** transitive findings in Hardhat/ethers tooling related to `elliptic`, with no upstream fix available through the current dependency path. They are not marked resolved. Re-evaluate them before mainnet and whenever the lockfile changes.

Do not run an unreviewed `npm audit fix --force` on the release branch: dependency changes must go through the same compile/test/typecheck/Docker verification as application code.

## Reporting and response

Treat suspected key compromise, unexpected oracle writes, replay anomalies, unexplained chain-parent mismatches or database divergence as security incidents. Stop the relevant writer, preserve logs/database/tx hashes, pause oracle activity when appropriate, and follow the runbooks before attempting recovery.

## Mainnet posture

`ALLOW_MAINNET_DEPLOY=true` is an explicit deployment kill-switch, not a readiness signal. Mainnet should additionally require reviewed code/CI, a successful Sepolia end-to-end proof, operator key separation, durable backups, known-dependency review and familiarity with deep-reorg recovery.
