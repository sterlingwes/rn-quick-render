// `rn-quick-render verify <snapsDir>` — render the snapshot artifacts a
// Jest run emitted (via rn-quick-render-jest) and pixel-diff them
// against committed goldens.
//
//   rn-quick-render verify __screensnaps__ [--goldens DIR] [--record]
//                    [--filter SUBSTR] [--test-path SUBSTR] [--fonts DIR]
//
// The snaps directory contains per-worker `manifest-w*.jsonl` files
// (one line per captured snapshot) and the mount-instruction JSON
// artifacts they reference. verify merges the manifests, expands each
// entry's device × fontScale matrix, renders everything in ONE warm JVM
// via the renderer's --batch mode, then compares each PNG against
// `<goldens>/<name>_<device>_<fontScale>.png`.
//
// --filter / --test-path select a subset by snapshot name / source test
// path substring — the hook for CI pipelines that only want to render
// snapshots belonging to changed components.
//
// Exit codes: 0 pass (or recorded), 1 diffs/missing goldens/render
// failure, 2 usage error.

"use strict";

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

// ---------- manifest handling (pure, unit-tested) ----------

function readManifests(snapsDir) {
  if (!fs.existsSync(snapsDir)) {
    throw new UsageError(`snaps directory not found: ${snapsDir}`);
  }
  const files = fs
    .readdirSync(snapsDir)
    .filter((f) => /^manifest-w.*\.jsonl$/.test(f))
    .sort();
  if (files.length === 0) {
    throw new UsageError(
      `no manifest-w*.jsonl found in ${snapsDir} — did the Jest run call screenSnapshot()?`,
    );
  }
  const entries = [];
  for (const file of files) {
    const lines = fs.readFileSync(path.join(snapsDir, file), "utf8").split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      entries.push(JSON.parse(line));
    }
  }
  // Same snapshot re-captured later in a run (or by a retry) wins.
  const byName = new Map();
  for (const e of entries) byName.set(e.name, e);
  return [...byName.values()];
}

function filterEntries(entries, { filter, testPath } = {}) {
  return entries.filter(
    (e) =>
      (!filter || e.name.includes(filter)) &&
      (!testPath || (e.testPath || "").includes(testPath)),
  );
}

// Expand entries × devices × fontScales into the renderer's batch
// manifest plus the expected-output list the diff step walks.
function planRenders(entries, { snapsDir, rendersDir, fonts }) {
  const batch = { entries: [] };
  if (fonts) batch.fonts = fonts;
  const expected = [];
  for (const e of entries) {
    for (const device of e.devices || ["pixel5"]) {
      for (const fontScale of e.fontScales || ["default"]) {
        const pngName = `${e.name}_${device}_${fontScale}.png`;
        batch.entries.push({
          input: path.join(snapsDir, e.input),
          output: path.join(rendersDir, pngName),
          device,
          fontScale,
        });
        expected.push({ name: e.name, device, fontScale, pngName });
      }
    }
  }
  return { batch, expected };
}

// ---------- pixel diff (pure, unit-tested) ----------

function diffPng(actualPath, goldenPath) {
  if (!fs.existsSync(goldenPath)) return { status: "missing-golden" };
  if (!fs.existsSync(actualPath)) return { status: "missing-render" };
  const a = PNG.sync.read(fs.readFileSync(actualPath));
  const g = PNG.sync.read(fs.readFileSync(goldenPath));
  if (a.width !== g.width || a.height !== g.height) {
    return {
      status: "diff",
      reason: `size ${a.width}x${a.height} vs golden ${g.width}x${g.height}`,
    };
  }
  let differing = 0;
  for (let i = 0; i < a.data.length; i++) {
    if (a.data[i] !== g.data[i]) differing++;
  }
  if (differing > 0) {
    return { status: "diff", reason: `${differing} differing byte(s)` };
  }
  return { status: "pass" };
}

// ---------- orchestration ----------

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = { record: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--goldens": opts.goldens = argv[++i]; break;
      case "--filter": opts.filter = argv[++i]; break;
      case "--test-path": opts.testPath = argv[++i]; break;
      case "--fonts": opts.fonts = argv[++i]; break;
      case "--record": opts.record = true; break;
      default:
        if (arg.startsWith("--")) throw new UsageError(`unknown flag: ${arg}`);
        positional.push(arg);
    }
  }
  if (positional.length !== 1) {
    throw new UsageError(
      "usage: rn-quick-render verify <snapsDir> [--goldens DIR] [--record] " +
        "[--filter SUBSTR] [--test-path SUBSTR] [--fonts DIR]",
    );
  }
  opts.snapsDir = positional[0];
  // Sibling default keeps committed goldens out of the (typically
  // gitignored) snaps output directory.
  opts.goldens = opts.goldens || `${opts.snapsDir.replace(/[/\\]+$/, "")}-goldens`;
  return opts;
}

// `render` is injectable for tests: (batchManifestPath) => exitCode.
// The default implementation execs the staged JVM via --batch.
function run(argv, { render, log = console.log, error = console.error } = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    if (e instanceof UsageError) {
      error(`rn-quick-render verify: ${e.message}`);
      return 2;
    }
    throw e;
  }

  let entries;
  try {
    entries = filterEntries(readManifests(opts.snapsDir), opts);
  } catch (e) {
    if (e instanceof UsageError) {
      error(`rn-quick-render verify: ${e.message}`);
      return 2;
    }
    throw e;
  }
  if (entries.length === 0) {
    error("rn-quick-render verify: no snapshots match the given filters");
    return 2;
  }

  const rendersDir = path.join(opts.snapsDir, ".renders");
  fs.mkdirSync(rendersDir, { recursive: true });
  const { batch, expected } = planRenders(entries, {
    snapsDir: opts.snapsDir,
    rendersDir,
    fonts: opts.fonts,
  });

  const batchPath = path.join(rendersDir, "batch-manifest.json");
  fs.writeFileSync(batchPath, JSON.stringify(batch, null, 2));

  const renderFn =
    render ?? ((manifestPath) => require("./launcher").runSync(["--batch", manifestPath]));
  const renderExit = renderFn(batchPath);
  if (renderExit !== 0) {
    error(`rn-quick-render verify: renderer exited with ${renderExit}`);
    return 1;
  }

  if (opts.record) {
    fs.mkdirSync(opts.goldens, { recursive: true });
    for (const exp of expected) {
      fs.copyFileSync(path.join(rendersDir, exp.pngName), path.join(opts.goldens, exp.pngName));
    }
    log(`recorded ${expected.length} golden(s) to ${opts.goldens}`);
    return 0;
  }

  let failures = 0;
  for (const exp of expected) {
    const result = diffPng(
      path.join(rendersDir, exp.pngName),
      path.join(opts.goldens, exp.pngName),
    );
    if (result.status === "pass") {
      log(`  ✓ ${exp.pngName}`);
    } else {
      failures++;
      const detail = result.reason ? ` (${result.reason})` : "";
      log(`  ✗ ${exp.pngName} — ${result.status}${detail}`);
    }
  }
  if (failures > 0) {
    error(
      `rn-quick-render verify: ${failures}/${expected.length} snapshot(s) failed. ` +
        `Fresh renders are in ${rendersDir}; re-run with --record to bless them.`,
    );
    return 1;
  }
  log(`${expected.length} snapshot(s) verified against ${opts.goldens}`);
  return 0;
}

module.exports = { run, readManifests, filterEntries, planRenders, diffPng, parseArgs };
