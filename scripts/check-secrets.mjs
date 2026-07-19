import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\0").filter(Boolean);
const tokenPatterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["OpenAI-style key", /\bsk-(?:proj-|live-)?[A-Za-z0-9_-]{20,}\b/],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["JWT/service token", /\beyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/],
];
const secretName = /(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|SERVICE_ROLE_KEY|API_KEY)$/;
const findings = [];

for (const file of tracked) {
  // `git ls-files --cached` includes tracked paths deleted in the current worktree.
  if (!existsSync(file)) continue;
  if (file === "pnpm-lock.yaml" || statSync(file).size > 1_000_000) continue;
  const bytes = readFileSync(file);
  if (bytes.includes(0)) continue;
  const text = bytes.toString("utf8");
  for (const [label, pattern] of tokenPatterns) {
    if (pattern.test(text)) findings.push(`${file}: possible ${label}`);
  }
  if (/^\.env(?:\.|$)/.test(file.split("/").at(-1) ?? "")) {
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match && secretName.test(match[1]) && match[2].trim()) {
        findings.push(`${file}:${index + 1}: secret examples must contain names only`);
      }
    }
  }
}

if (findings.length) {
  process.stderr.write(`Secret scan failed:\n${findings.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`Secret scan passed (${tracked.length} tracked files checked).\n`);
