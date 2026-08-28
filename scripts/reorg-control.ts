import { pathToFileURL } from "node:url";
import { DaemonStore } from "../daemon/src/store.js";
import "../daemon/src/store-operational.js";

export const DEEP_REORG_ACKNOWLEDGEMENT = "I_HAVE_RECOVERED_CANONICAL_STATE";

export interface ReorgStatus {
  engaged: boolean;
  reason: string | null;
}

export function reorgStatus(store: DaemonStore): ReorgStatus {
  const reason = store.failStopReason();
  return { engaged: reason !== null, reason };
}

export function clearReorgFailStop(
  store: DaemonStore,
  acknowledgement: string | undefined,
): boolean {
  if (acknowledgement !== DEEP_REORG_ACKNOWLEDGEMENT) {
    throw new Error(
      `ACKNOWLEDGE_DEEP_REORG must equal ${DEEP_REORG_ACKNOWLEDGEMENT} after canonical-state recovery`,
    );
  }
  return store.clearFailStop();
}

export async function runReorgControlCli(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const command = argv[0] ?? "status";
  if (command !== "status" && command !== "clear") {
    throw new Error("usage: reorg-control.ts status|clear");
  }
  const dbPath = env.DB_PATH ?? "daemon/data/merzavtsy.sqlite";
  const store = new DaemonStore(dbPath);
  try {
    if (command === "status") {
      process.stdout.write(`${JSON.stringify(reorgStatus(store))}\n`);
      return;
    }
    const cleared = clearReorgFailStop(store, env.ACKNOWLEDGE_DEEP_REORG);
    process.stdout.write(`${JSON.stringify({ cleared, ...reorgStatus(store) })}\n`);
  } finally {
    store.close();
  }
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && pathToFileURL(entry).href === import.meta.url;
}

if (isDirectExecution()) {
  runReorgControlCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown reorg-control error";
    console.error(`Merzavtsy reorg control failed: ${message}`);
    process.exitCode = 1;
  });
}
