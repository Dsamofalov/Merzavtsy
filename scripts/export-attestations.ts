import { DaemonStore } from "../daemon/src/store.js";
import { signedActivityArchive } from "../daemon/src/signed-archive.js";

const dbPath = process.env.DB_PATH?.trim() || "daemon/data/merzavtsy.sqlite";
const store = new DaemonStore(dbPath);
try {
  const archive = signedActivityArchive(store);
  console.log(JSON.stringify(archive, (_key, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value,
  2));
} finally {
  store.close();
}
