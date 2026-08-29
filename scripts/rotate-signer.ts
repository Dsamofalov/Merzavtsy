import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { rotateOracleSigner, type SignerRotationDriver } from "../daemon/src/signer-rotation.js";

const ABI = [
  { type: "function", name: "ORACLE_SIGNER_ROLE", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32", name: "" }] },
  { type: "function", name: "hasRole", stateMutability: "view", inputs: [{ type: "bytes32", name: "role" }, { type: "address", name: "account" }], outputs: [{ type: "bool", name: "" }] },
  { type: "function", name: "grantRole", stateMutability: "nonpayable", inputs: [{ type: "bytes32", name: "role" }, { type: "address", name: "account" }], outputs: [] },
  { type: "function", name: "revokeRole", stateMutability: "nonpayable", inputs: [{ type: "bytes32", name: "role" }, { type: "address", name: "account" }], outputs: [] },
] as const;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function address(name: string): Address {
  const value = required(name);
  if (!isAddress(value, { strict: false }) || /^0x0{40}$/i.test(value)) {
    throw new Error(`${name} must be a non-zero Ethereum address`);
  }
  return value as Address;
}

function privateKey(name: string): Hex {
  const value = required(name);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${name} must be a 32-byte private key`);
  return value as Hex;
}

const rpcUrl = required("RPC_URL");
const chainId = BigInt(required("CHAIN_ID"));
if (chainId <= 0n || chainId > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("CHAIN_ID must be a safe positive integer");
const oracleAddress = address("ORACLE_ADDRESS");
const oldSigner = address("OLD_ORACLE_SIGNER");
const nextSigner = address("NEW_ORACLE_SIGNER");
const account = privateKeyToAccount(privateKey("ADMIN_PRIVATE_KEY"));
const chain = defineChain({
  id: Number(chainId),
  name: `Merzavtsy signer rotation ${chainId}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

if (BigInt(await publicClient.getChainId()) !== chainId) throw new Error("RPC chain does not match CHAIN_ID");
const role = await publicClient.readContract({ address: oracleAddress, abi: ABI, functionName: "ORACLE_SIGNER_ROLE" });

async function write(functionName: "grantRole" | "revokeRole", signer: Address): Promise<void> {
  const hash = await walletClient.writeContract({
    address: oracleAddress,
    abi: ABI,
    functionName,
    args: [role, signer],
  } as never);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
  console.log(`${functionName} tx=${hash}`);
}

const driver: SignerRotationDriver = {
  async hasSigner(signer) {
    return publicClient.readContract({ address: oracleAddress, abi: ABI, functionName: "hasRole", args: [role, signer] });
  },
  async grantSigner(signer) {
    await write("grantRole", signer);
  },
  async revokeSigner(signer) {
    await write("revokeRole", signer);
  },
  async hasSignerAfter(signer) {
    return publicClient.readContract({ address: oracleAddress, abi: ABI, functionName: "hasRole", args: [role, signer] });
  },
};

await rotateOracleSigner(driver, oldSigner, nextSigner);
console.log(`Oracle signer rotation verified: ${oldSigner} -> ${nextSigner}`);
