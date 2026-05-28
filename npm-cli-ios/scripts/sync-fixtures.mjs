#!/usr/bin/env node
// Mirrors rn-harness's captured Fabric mount-instruction fixtures into
// npm-cli-ios's tests/fixtures so the fidelity suite has something to
// render against the BE. Re-run after rn-harness adds or updates fixtures
// upstream.
//
// Usage:
//   npm run sync-fixtures                                    # copy from default sibling path
//   node scripts/sync-fixtures.mjs --src /path/to/harness/out
//   node scripts/sync-fixtures.mjs --check                   # error if anything would change
//
// --check mode is the CI affordance: fails the build if tests/fixtures/
// drifts from upstream without a sync commit.

import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const DEFAULT_SRC = resolve(ROOT, "../rn-harness/out");
const DEST = resolve(ROOT, "tests/fixtures");

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const srcIdx = args.indexOf("--src");
const SRC = srcIdx >= 0 ? resolve(args[srcIdx + 1]) : DEFAULT_SRC;

try {
  await stat(SRC);
} catch {
  console.error(
    `sync-fixtures: source dir not found at ${SRC}\n` +
      `Set --src or clone https://github.com/sterlingwes/rn-quick-render as a sibling of this repo.`,
  );
  process.exit(1);
}

await mkdir(DEST, { recursive: true });

const entries = (await readdir(SRC)).filter((f) => f.endsWith(".json")).sort();
if (entries.length === 0) {
  console.error(`sync-fixtures: no .json fixtures found in ${SRC}`);
  process.exit(1);
}

const diffs = [];
for (const name of entries) {
  const srcBuf = await readFile(join(SRC, name));
  let destBuf;
  try {
    destBuf = await readFile(join(DEST, name));
  } catch {
    destBuf = null;
  }
  if (destBuf && srcBuf.equals(destBuf)) continue;
  diffs.push({ name, status: destBuf ? "changed" : "added" });
  if (!checkOnly) await writeFile(join(DEST, name), srcBuf);
}

const existing = new Set(entries);
const stale = (await readdir(DEST)).filter((f) => f.endsWith(".json") && !existing.has(f));
for (const name of stale) {
  diffs.push({ name, status: "stale (upstream removed)" });
}

if (diffs.length === 0) {
  console.log(`sync-fixtures: ${entries.length} fixtures up to date`);
  process.exit(0);
}

console.log(`sync-fixtures: ${diffs.length} change(s):`);
for (const { name, status } of diffs) console.log(`  ${status.padEnd(28)} ${name}`);

if (checkOnly) {
  console.error(
    `\nsync-fixtures: --check failed. Run 'node scripts/sync-fixtures.mjs' and commit the result.`,
  );
  process.exit(1);
}
console.log(`\nsynced from ${SRC} → ${DEST}`);
