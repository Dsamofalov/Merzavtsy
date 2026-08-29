# Dependency risk register

This document records dependency findings that remain after the repository's automated security gates. It is not a waiver for future upgrades or an external smart-contract audit.

## Current npm audit result

A clean `npm ci` currently reports **11 low severity vulnerabilities** in a transitive development-tooling path rooted in `elliptic` and ethers v5 packages pulled by Hardhat verification / ignition tooling.

The relevant advisory is:

- `GHSA-848j-6mx2-7j84` — Elliptic uses a cryptographic primitive with a risky implementation.

At the current pinned dependency graph, npm reports **no fix available** for this transitive path.

The application runtime itself uses `viem`; Merzavtsy does not use the affected ethers v5 signing-key packages as its production oracle-signing implementation. The vulnerable packages remain present because they are transitive dependencies of the Hardhat development/verification toolchain.

## Automated release gates

`npm run verify` includes:

```bash
npm run audit:secrets
npm run audit:high
```

`audit:high` runs `npm audit --audit-level=high`. Therefore a future high or critical advisory fails the verification gate. The current 11 findings are low severity and do not cause this high-severity gate to fail.

## Accepted residual risk for the MVP branch

For the current MVP branch, the 11 low-severity transitive findings are accepted as a documented residual development-tooling risk because:

1. npm currently reports no fix available in the pinned dependency path;
2. the affected ethers v5 packages are not the production gameplay signer implementation;
3. all Merzavtsy private-key handling is separately tested and source-secret scanning is mandatory;
4. contracts and daemon behavior are covered by unit/property/integration tests;
5. this acceptance does **not** authorize skipping an external smart-contract audit before production mainnet use.

This acceptance must be revisited when Hardhat/toolbox releases change the dependency graph or if the advisory severity/exploitability changes.

## Upgrade procedure

Before changing the Hardhat/toolbox dependency family:

1. inspect the resolved `package-lock.json` diff;
2. rerun `npm ci` from a clean checkout;
3. run the full `npm run verify` suite;
4. run `npm audit` and compare the advisory set;
5. do not use `npm audit fix --force` blindly, because a forced major-version change can alter compiler/test/deployment behavior;
6. repeat Docker image build and Compose validation in CI.

## Production boundary

Passing the npm gate means only that no high/critical npm advisory currently blocks the JavaScript/TypeScript dependency tree. It is not evidence that Solidity contracts are externally audited or that a live Sepolia deployment has been proven. Those are separate release gates.
