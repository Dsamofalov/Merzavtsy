import { scanRepositorySecrets } from "../daemon/src/secret-scan.js";

const findings = scanRepositorySecrets(process.cwd());
if (findings.length !== 0) {
  for (const finding of findings) {
    console.error(`${finding.path}:${finding.line} ${finding.kind}`);
  }
  console.error(`Secret scan failed with ${findings.length} finding(s).`);
  process.exitCode = 1;
} else {
  console.log("Secret scan passed: no secret-shaped tracked source detected.");
}
