import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export interface SecretFinding {
  path: string;
  line: number;
  kind: string;
}

const IGNORED_DIRECTORIES = new Set([
  ".git", "node_modules", "artifacts", "cache", "coverage", "dist", ".worktrees",
]);
const IGNORED_FILES = new Set(["package-lock.json"]);
const BINARY_EXTENSIONS = /\.(?:png|jpe?g|gif|webp|ico|pdf|zip|gz|sqlite|db|woff2?|ttf)$/i;

function placeholder(line: string): boolean {
  return /YOUR_|CHANGE_ME|PLACEHOLDER|<[^>]+>|\$\{[^}]+\}|0xYOUR/i.test(line);
}

function kindFor(line: string): string | null {
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(line)) return "private-key-pem";
  if (/\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/.test(line)) return "github-token";
  if (/\bsk-[A-Za-z0-9_-]{24,}\b/.test(line)) return "api-token";
  if (/\b(?:PRIVATE_KEY|MNEMONIC|SEED_PHRASE|API_SECRET|API_KEY|ACCESS_TOKEN)\b\s*[:=]\s*["']?0x[0-9a-fA-F]{64}\b/i.test(line)) {
    return "secret-assignment";
  }
  if (/\b(?:MNEMONIC|SEED_PHRASE)\b\s*[:=]\s*["'][a-z]+(?:\s+[a-z]+){11,23}["']/i.test(line)) {
    return "seed-phrase";
  }
  return null;
}

export function scanRepositorySecrets(root: string): SecretFinding[] {
  const findings: SecretFinding[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) walk(join(directory, entry.name));
        continue;
      }
      if (!entry.isFile() || IGNORED_FILES.has(entry.name) || BINARY_EXTENSIONS.test(entry.name)) continue;
      const path = join(directory, entry.name);
      let content: string;
      try {
        content = readFileSync(path, "utf8");
      } catch {
        continue;
      }
      const lines = content.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]!;
        if (placeholder(line)) continue;
        const kind = kindFor(line);
        if (kind !== null) {
          findings.push({ path: relative(root, path).replaceAll("\\", "/"), line: index + 1, kind });
        }
      }
    }
  };

  walk(root);
  return findings.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
}
