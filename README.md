# Merzavtsy

Merzavtsy is an Ethereum-native autonomous life game. One Ethereum account can birth one permanently account-bound creature. The creature evolves from finalized wallet activity, accumulated biography, deterministic social history and autonomous life ticks. The MVP deliberately contains no project token, marketplace, yield, paid stat boosts or custody of user assets.

## Repository status

Development happens on the `feat/mvp` branch and is exercised by a single verification pipeline. The intended rollout order is **local → Sepolia → mainnet**. Always test local and Sepolia **before mainnet**. A successful local test does not prove Sepolia or mainnet readiness.

## Requirements

- Node.js 22.13 or newer
- npm
- an Ethereum JSON-RPC endpoint
- Docker + Docker Compose for the containerized daemon path

Install and verify:

```bash
npm ci
npm run verify
```

`npm run verify` compiles Solidity, runs contract tests, runs daemon tests, type-checks TypeScript and rejects high-or-critical npm audit findings. The current dependency tree can still contain reviewed low-severity transitive findings; see `SECURITY.md`.

## Architecture at a glance

- `Merzavets.sol` — one locked ERC-721-style identity per account; transfers and burns are forbidden.
- `MerzavetsWorld.sol` — canonical personality, needs, XP, stages, hibernation, mutations, scars, directional relationships and autonomous life.
- `ActivityOracle.sol` — bounded EIP-712 gameplay attestations with signer roles, replay protection and pause control.
- `daemon/` — finalized-chain watcher, classifier, deterministic epoch aggregator, registry/indexer, SQLite state, signer/submitter and keeper.
- `scripts/` — deploy, birth, inspection, manual attestation and deep-reorg operator controls.

See `CONCEPT.md` for product rules and `ARCHITECTURE.md` for trust/data-flow details.

## Configuration

Copy the example and replace placeholders only in your local secret store:

```bash
cp .env.example .env
```

Important separation:

- `ORACLE_PRIVATE_KEY` signs bounded EIP-712 gameplay facts.
- `SUBMITTER_PRIVATE_KEY` pays gas and broadcasts transactions.
- `DEPLOYER_PRIVATE_KEY` is deployment-only.
- `BIRTH_PRIVATE_KEY` is the user's explicit birth transaction key for the CLI.

Never commit `.env` or private keys. Logs are structured JSON and redact secret-bearing fields, but redaction is defense in depth rather than permission to log secrets.

## Local deployment

Run a local Ethereum-compatible JSON-RPC endpoint, then configure for chain `31337`:

```bash
export RPC_URL=http://127.0.0.1:8545
export CHAIN_ID=31337
export DEPLOYER_PRIVATE_KEY=0x...
export ORACLE_SIGNER_ADDRESS=0x...
npm run compile
npm run deploy
```

The deployment command writes `deployments/31337.json`. Populate the runtime addresses from that file, set distinct oracle/submitter keys, set `LOCAL_MODE=true`, then validate and start:

```bash
npm run status
npm run daemon
```

For a creature account, set `BIRTH_PRIVATE_KEY` and run:

```bash
npm run birth
npm run show:state -- 1
```

## Sepolia deployment

Sepolia chain ID is **11155111**. Use a Sepolia RPC URL and funded Sepolia-only keys:

```bash
export RPC_URL=https://your-sepolia-rpc.example
export CHAIN_ID=11155111
export DEPLOYER_PRIVATE_KEY=0x...
export ORACLE_SIGNER_ADDRESS=0x...
npm run compile
npm run deploy
```

Then configure the emitted `deployments/11155111.json`, run `npm run status`, exercise birth, finalized watcher activity, oracle submission, replay rejection, restart persistence and keeper ticks. Preserve tx hashes and block numbers as rollout evidence. This repository does **not** claim that a Sepolia smoke test has already been completed unless such evidence is separately recorded.

## Guarded mainnet deployment

Ethereum mainnet chain ID is `1`. The deploy CLI refuses mainnet before any deployment transaction unless the explicit kill-switch is enabled:

```bash
export CHAIN_ID=1
export ALLOW_MAINNET_DEPLOY=true
npm run deploy
```

Do not set `ALLOW_MAINNET_DEPLOY=true` casually. Before mainnet, require a green clean-room CI run, reviewed dependency findings, a successful Sepolia end-to-end run with tx evidence, backed-up deployment metadata, funded dedicated operator accounts and an operator familiar with `OPERATIONS.md`.

## Runtime and Docker

Run directly:

```bash
npm run daemon
```

Or validate and run the container stack:

```bash
docker compose config --quiet
docker compose up --build
```

SQLite must live on persistent storage. Runtime startup validates chain ID, bytecode and contract wiring before opening the durable store.

## Operator commands

```bash
npm run status
npm run show:state -- <tokenId>
npm run show:relationship -- <actorTokenId> <targetTokenId>
npm run reorg:status
```

If the daemon detects a finalized parent mismatch, it enters a durable fail-stop. Do not clear it until canonical-state recovery is complete. The recovery procedure and acknowledgement command are in `OPERATIONS.md`.

## Security model

The oracle is gameplay authority, not asset authority. Attestations can only call bounded world-update entrypoints. The project never asks the oracle or submitter to custody user ETH or ERC-20 balances. See `SECURITY.md` for key separation, replay controls, finality assumptions, logging redaction and known dependency findings.
