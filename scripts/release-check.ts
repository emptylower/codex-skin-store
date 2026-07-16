#!/usr/bin/env npx tsx
/**
 * Local MVP release gate runner.
 * Invokes named checks as subprocesses and exits nonzero with actionable labels.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.cloudflare.json scripts/release-check.ts
 *   npx tsx --tsconfig tsconfig.cloudflare.json scripts/release-check.ts --skip-e2e
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

type Gate = {
  name: string;
  command: string;
  args: string[];
  optional?: boolean;
};

const skipE2e = process.argv.includes("--skip-e2e");
const root = process.cwd();

const gates: Gate[] = [
  { name: "format", command: "npm", args: ["run", "format:check"] },
  { name: "lint", command: "npm", args: ["run", "lint"] },
  { name: "typecheck", command: "npm", args: ["run", "typecheck"] },
  { name: "test", command: "npm", args: ["run", "test"] },
  { name: "build", command: "npm", args: ["run", "build"] },
  {
    name: "seo-audit",
    command: "npx",
    args: [
      "tsx",
      "--tsconfig",
      "tsconfig.cloudflare.json",
      "scripts/audit-seo-landings.ts",
    ],
  },
  {
    name: "package-schema",
    command: "npm",
    args: ["run", "test:packages"],
  },
];

if (!skipE2e) {
  gates.push({
    name: "e2e",
    command: "npm",
    args: ["run", "test:e2e"],
    optional: false,
  });
}

const results: Array<{ name: string; ok: boolean; detail: string }> = [];

for (const gate of gates) {
  console.log(`\n==> gate:${gate.name}`);
  const result = spawnSync(gate.command, gate.args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  const ok = result.status === 0;
  results.push({
    name: gate.name,
    ok,
    detail: ok ? "pass" : `exit ${result.status ?? "signal"}`,
  });
  if (!ok && !gate.optional) {
    console.error(
      `\nRELEASE GATE FAILED: ${gate.name} (${results.at(-1)?.detail})`,
    );
    // Continue collecting? Fail-fast for actionable named gate.
    break;
  }
}

// Local migration presence check (does not apply remote).
const migration = path.join(root, "migrations", "0004_release_gate.sql");
const migrationOk = existsSync(migration);
results.push({
  name: "migration-0004-present",
  ok: migrationOk,
  detail: migrationOk ? "present" : "missing migrations/0004_release_gate.sql",
});

console.log("\n==> release-check summary");
for (const row of results) {
  console.log(`  ${row.ok ? "PASS" : "FAIL"}  ${row.name}  (${row.detail})`);
}

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(
    `\n${failed.length} gate(s) failed: ${failed.map((f) => f.name).join(", ")}`,
  );
  process.exit(1);
}

console.log("\nAll local release gates passed.");
process.exit(0);
