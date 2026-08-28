import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

async function textOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

describe("Docker packaging", () => {
  it("runs the daemon as a non-root user with a writable persistent SQLite directory", async () => {
    const dockerfile = await textOrEmpty("Dockerfile");

    assert.match(dockerfile, /FROM node:22-[^\s]+/);
    assert.match(dockerfile, /USER node/);
    assert.match(dockerfile, /daemon\/data/);
    assert.match(dockerfile, /CMD \["npm", "run", "daemon"\]/);
  });

  it("compose injects env without baking secrets and persists daemon state", async () => {
    const compose = await textOrEmpty("compose.yaml");

    assert.match(compose, /env_file:\s*\n\s*- \.env/);
    assert.match(compose, /merzavtsy-data:\/app\/daemon\/data/);
    assert.match(compose, /restart:\s*unless-stopped/);
    assert.match(compose, /DB_PATH:\s*\/app\/daemon\/data\/merzavtsy\.sqlite/);
    assert.match(compose, /volumes:\s*[\s\S]*merzavtsy-data:/);
  });

  it("dockerignore excludes secrets, local SQLite state, build output and git metadata", async () => {
    const dockerignore = await textOrEmpty(".dockerignore");

    for (const required of [".env", "daemon/data", "node_modules", ".git", "artifacts", "cache"]) {
      assert.ok(dockerignore.split(/\r?\n/).includes(required), `.dockerignore must contain ${required}`);
    }
  });
});
