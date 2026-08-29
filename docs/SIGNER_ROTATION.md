# Oracle signer rotation

The oracle signer authorizes gameplay facts only. It must remain separate from the transaction submitter key.

## Preconditions

1. Confirm the deployment metadata and live `ActivityOracle` address for `CHAIN_ID`.
2. Keep the existing signer online until the replacement role is proven active.
3. Use an account with `DEFAULT_ADMIN_ROLE`; never reuse the oracle signer or submitter key as the admin key.
4. Set `OLD_ORACLE_SIGNER` and `NEW_ORACLE_SIGNER` to non-zero, different addresses.

## Procedure

Run:

```bash
ADMIN_PRIVATE_KEY=... \
OLD_ORACLE_SIGNER=0x... \
NEW_ORACLE_SIGNER=0x... \
npm run rotate:signer
```

The command is intentionally **grant-before-revoke**:

1. verify the old signer currently has `ORACLE_SIGNER_ROLE`;
2. grant `ORACLE_SIGNER_ROLE` to the replacement;
3. read the role back from chain and require it to be active;
4. revoke the old signer;
5. read both postconditions and require the old role to be absent.

Every write waits for a successful receipt. The command prints transaction hashes and addresses, never private-key material.

## Recovery

If grant or confirmation fails, the old signer is not revoked. Fix RPC/admin/funding issues and retry. If revoke fails after the replacement is confirmed, both signers may temporarily remain authorized; investigate and rerun the revoke step before considering rotation complete.

After rotation, issue one bounded test attestation on Sepolia (or the intended non-production environment) and verify normal signer recovery/submission before rotating production credentials.
