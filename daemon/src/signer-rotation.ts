import { isAddress, zeroAddress, type Address } from "viem";

export interface SignerRotationDriver {
  hasSigner(address: Address): Promise<boolean>;
  grantSigner(address: Address): Promise<void>;
  revokeSigner(address: Address): Promise<void>;
  hasSignerAfter(address: Address): Promise<boolean>;
}

function validate(address: Address, label: string): void {
  if (!isAddress(address, { strict: false }) || address.toLowerCase() === zeroAddress) {
    throw new Error(`${label} must be a non-zero Ethereum address`);
  }
}

/** Grant-before-revoke rotation so a signer outage is never created intentionally. */
export async function rotateOracleSigner(
  driver: SignerRotationDriver,
  oldSigner: Address,
  nextSigner: Address,
): Promise<void> {
  validate(oldSigner, "old signer");
  validate(nextSigner, "next signer");
  if (oldSigner.toLowerCase() === nextSigner.toLowerCase()) {
    throw new Error("old and next oracle signer must differ");
  }
  if (!await driver.hasSigner(oldSigner)) throw new Error("old oracle signer role is not active");

  if (!await driver.hasSigner(nextSigner)) {
    await driver.grantSigner(nextSigner);
  }
  if (!await driver.hasSignerAfter(nextSigner)) {
    throw new Error("new oracle signer role was not confirmed after grant");
  }

  await driver.revokeSigner(oldSigner);
  if (await driver.hasSignerAfter(oldSigner)) {
    throw new Error("old oracle signer role is still active after revoke");
  }
}
