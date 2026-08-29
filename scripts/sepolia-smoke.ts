import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { buildSepoliaSmokeProof, validateSepoliaSmokeTarget } from "../daemon/src/sepolia-smoke.js";
import { runStatusCli } from "./status.js";

function chainId(env: NodeJS.ProcessEnv): bigint {
  const raw = env.CHAIN_ID?.trim();
  if (raw === undefined || !/^[0-9]+$/.test(raw)) throw new Error("CHAIN_ID is required for Sepolia smoke test");
  return BigInt(raw);
}

export async function runSepoliaSmokeCli(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  validateSepoliaSmokeTarget(chainId(env));
  const status = await runStatusCli(env);
  if (!status.healthy) throw new Error(`Sepolia deployment unhealthy: ${status.problems.join("; ")}`);

  const proof = buildSepoliaSmokeProof({
    chainId: status.chainId,
    headBlock: status.headBlock,
    deploymentBlock: status.deploymentBlock,
    identityAddress: status.identityAddress,
    worldAddress: status.worldAddress,
    oracleAddress: status.oracleAddress,
    deployedAt: status.deployedAt,
    healthy: status.healthy,
  });

  const proofPath = env.SEPOLIA_PROOF_PATH?.trim() || "proofs/sepolia-smoke.json";
  await mkdir(dirname(proofPath), { recursive: true });
  await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(`Sepolia smoke proof written to ${proofPath}`);
}

runSepoliaSmokeCli().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown Sepolia smoke error";
  console.error(`Merzavtsy Sepolia smoke failed: ${message}`);
  process.exitCode = 1;
});
