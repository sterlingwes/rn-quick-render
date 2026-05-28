#!/usr/bin/env node
// Capture bootstrap. Runs in rn-harness's CommonJS+ts-node environment
// (rn-harness is CJS, the capture stack uses require() throughout).
//
// Invoked by the CLI's `capture` command:
//   node -r <npm-cli-ios>/node_modules/ts-node/register \
//     scripts/capture-bootstrap.cjs <fixture.tsx> --out <json> --appearance <mode>
//
// Resolves rn-harness via the standard node_modules chain (file: dep
// from npm-cli-ios's package.json), with a fallback to a sibling
// checkout for dev environments where the install hasn't happened.

"use strict";

const fs = require("fs");
const path = require("path");

const HARNESS_ROOT = findHarnessRoot();

function findHarnessRoot() {
  const explicit = process.env.RN_HARNESS_ROOT;
  if (explicit && hasPackage(explicit)) return explicit;

  // Standard install path: node_modules sibling of this package.
  try {
    const fromResolve = path.dirname(require.resolve("rn-harness/package.json"));
    if (hasPackage(fromResolve)) return fromResolve;
  } catch {
    // fall through to dev-checkout heuristics
  }

  // Dev checkout layout: npm-cli-ios and rn-harness are siblings.
  const sibling = path.resolve(__dirname, "..", "..", "rn-harness");
  if (hasPackage(sibling)) return sibling;

  console.error(
    "Cannot locate rn-harness. Either:\n" +
      "  1. Run `npm install` inside npm-cli-ios (installs rn-harness via file:../rn-harness)\n" +
      "  2. Set RN_HARNESS_ROOT=/path/to/rn-harness",
  );
  process.exit(1);
}

function hasPackage(dir) {
  return fs.existsSync(path.join(dir, "package.json"));
}

// ── Parse args ─────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const fixturePath = argv[0];
const outIdx = argv.indexOf("--out");
const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
const appearanceIdx = argv.indexOf("--appearance");
const appearance = (appearanceIdx >= 0 ? argv[appearanceIdx + 1] : "light") || "light";

if (!fixturePath) {
  console.error(
    "Usage: capture-bootstrap.cjs <fixture.tsx> [--out output.json] [--appearance light|dark]",
  );
  process.exit(1);
}

if (appearance !== "light" && appearance !== "dark") {
  console.error(`--appearance must be 'light' or 'dark' (got '${appearance}')`);
  process.exit(1);
}

const resolvedFixture = path.resolve(fixturePath);
if (!fs.existsSync(resolvedFixture)) {
  console.error("Fixture not found: " + resolvedFixture);
  process.exit(1);
}

// ── Load capture stack from rn-harness ─────────────────────────────────────

const { loadRealRn, setColorScheme } = require(path.join(HARNESS_ROOT, "src", "loadRealRn"));
const {
  renderFixture,
  renderFrames,
  isConcurrentFixture,
  renderConcurrent,
} = require(path.join(HARNESS_ROOT, "src", "renderFixture"));

// Bootstrap the full RN runtime BEFORE setColorScheme + require(fixture).
// loadRealRn is a superset of loadFabric; if the fixture imports it itself
// the second call is a no-op (idempotent on globalThis.__rnHarnessFabric).
//
// Important: setColorScheme has to land before the fixture is required —
// PlatformColor and useColorScheme resolve at render time using whatever
// scheme is current. A late setColorScheme leaves the captured tree on
// the wrong scheme even though the iOS chrome would be right.
loadRealRn();
setColorScheme(appearance);

// ── Capture ────────────────────────────────────────────────────────────────

async function main() {
  const element = require(resolvedFixture).default;
  const started = Date.now();

  let result;
  if (isConcurrentFixture(element)) {
    result = await renderConcurrent(element);
  } else if (Array.isArray(element)) {
    result = renderFrames(element);
  } else {
    result = renderFixture(element);
  }

  const elapsedMs = Date.now() - started;

  const payload = {
    fixture: path.basename(resolvedFixture, path.extname(resolvedFixture)),
    surfaceId: result.surfaceId,
    instructionCount: result.instructions.length,
    instructions: result.instructions,
    appearance,
  };

  const json = JSON.stringify(payload, null, 2) + "\n";

  if (outPath) {
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(outPath, json);
    console.error(
      `[capture] ${payload.fixture} (${appearance}): ${result.instructions.length} instructions, ${elapsedMs} ms → ${outPath}`,
    );
  } else {
    process.stdout.write(json);
    console.error(
      `[capture] ${payload.fixture} (${appearance}): ${result.instructions.length} instructions, ${elapsedMs} ms`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
