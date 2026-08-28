# Sepolia smoke test and deployment proof

This runbook is the canonical procedure for producing a **real Sepolia deployment proof** for Merzavtsy.

## Target

- Network: Ethereum Sepolia
- Chain ID: `11155111`
- Command: `npm run smoke:sepolia`
- Default proof file: `proofs/sepolia-smoke.json`

The smoke command fails closed if `CHAIN_ID` is anything other than `11155111`.

## Preconditions

1. Start from a clean checkout and run `npm ci && npm run verify`.
2. Copy `.env.example` to `.env` and configure a Sepolia RPC URL.
3. Use separate deployer, oracle signer, and submitter keys. Never commit them.
4. Fund only the deployer/submitter addresses with the minimum Sepolia ETH required for testing.
5. Keep `ALLOW_MAINNET_DEPLOY=false`.

## Deploy and verify

```bash
CHAIN_ID=11155111 npm run deploy
CHAIN_ID=11155111 npm run status
CHAIN_ID=11155111 npm run smoke:sepolia
```

`npm run status` verifies:

- RPC chain ID;
- bytecode at Identity, World, and Oracle addresses;
- `identity.world` wiring;
- `world.oracle` wiring;
- `oracle.identity` and `oracle.world` wiring;
- current head block.

The smoke command repeats the topology check and writes a proof only if the deployment is healthy.

## Proof artifact

A valid `proofs/sepolia-smoke.json` contains:

- `version: 1`;
- `chainId: "11155111"`;
- deployment and observed head blocks;
- Identity, World, and Oracle addresses;
- deployment timestamp;
- observation timestamp;
- `healthy: true`.

The file is evidence of a **specific live observation**, not a substitute for contract tests or an external audit. Do not check a fabricated or manually edited proof into the repository. If the proof is published for a release, preserve the original file hash and the exact commit SHA that produced it.

## Optional end-to-end Sepolia exercise

After topology proof, the operator should exercise the same sequence as the local integration test with test-only accounts:

1. birth two locked creatures;
2. create ordinary Sepolia account/contract activity;
3. run the watcher through finality;
4. sign and submit one activity attestation;
5. confirm XP/personality state changed within caps;
6. confirm a registered-peer encounter changed directional relationship state;
7. call `lifeTick` after cooldown;
8. export/audit signed attestations.

Record transaction hashes separately from private keys. The repository never needs the private keys to retain proof of the public transactions.

## Failure handling

If the smoke command fails, do not write or bless a proof. Resolve the chain/address/wiring mismatch, rerun `status`, and then rerun the smoke command. A failed or stale deployment must never be relabeled as a passing proof.
