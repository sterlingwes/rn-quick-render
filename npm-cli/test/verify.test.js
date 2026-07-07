// Unit tests for the verify subcommand's JVM-independent pieces, plus
// an end-to-end run() exercise with an injected fake renderer that
// consumes the batch manifest exactly like Main.kt's --batch mode
// (reads entries, writes a PNG per output path).
//
// Run: node --test npm-cli/test/

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { PNG } = require("pngjs");

const { run, readManifests, filterEntries, planRenders, diffPng } = require("../lib/verify");

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rqr-verify-"));
}

function writePng(file, { width = 4, height = 4, seed = 0 } = {}) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = (i + seed) % 256;
    png.data[i + 1] = 128;
    png.data[i + 2] = 64;
    png.data[i + 3] = 255;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

function seedSnaps(snapsDir, entries) {
  fs.mkdirSync(snapsDir, { recursive: true });
  const byWorker = new Map();
  for (const e of entries) {
    const worker = e.worker || "1";
    const line = { ...e };
    delete line.worker;
    fs.writeFileSync(path.join(snapsDir, line.input), JSON.stringify({ fixture: line.name, instructions: [] }));
    byWorker.set(worker, (byWorker.get(worker) || "") + JSON.stringify(line) + "\n");
  }
  for (const [worker, content] of byWorker) {
    fs.writeFileSync(path.join(snapsDir, `manifest-w${worker}.jsonl`), content);
  }
}

// A stand-in for `java --batch`: renders each entry as a deterministic
// PNG whose pixels derive from the entry's input+device+fontScale, so
// "same golden" and "changed render" are both expressible.
function fakeRenderer({ seedFor = () => 0 } = {}) {
  return (batchManifestPath) => {
    const batch = JSON.parse(fs.readFileSync(batchManifestPath, "utf8"));
    for (const entry of batch.entries) {
      writePng(entry.output, { seed: seedFor(entry) });
    }
    return 0;
  };
}

test("readManifests merges workers and dedupes by name, last wins", () => {
  const snaps = path.join(tmpdir(), "snaps");
  seedSnaps(snaps, [
    { name: "a", input: "a.json", devices: ["pixel5"], fontScales: ["default"], worker: "1" },
    { name: "b", input: "b.json", devices: ["pixel5"], fontScales: ["default"], worker: "2" },
  ]);
  // duplicate capture of "a" in a later manifest line
  fs.appendFileSync(
    path.join(snaps, "manifest-w2.jsonl"),
    JSON.stringify({ name: "a", input: "a.json", devices: ["tablet"], fontScales: ["default"] }) + "\n",
  );
  const entries = readManifests(snaps);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.find((e) => e.name === "a").devices, ["tablet"]);
});

test("filterEntries selects by name and test path substring", () => {
  const entries = [
    { name: "inboxCard", testPath: "__tests__/InboxCard.test.js" },
    { name: "profileHeader", testPath: "__tests__/Profile.test.js" },
  ];
  assert.deepEqual(filterEntries(entries, { filter: "inbox" }).map((e) => e.name), ["inboxCard"]);
  assert.deepEqual(filterEntries(entries, { testPath: "Profile" }).map((e) => e.name), ["profileHeader"]);
  assert.equal(filterEntries(entries, {}).length, 2);
});

test("planRenders expands the device × fontScale matrix", () => {
  const { batch, expected } = planRenders(
    [{ name: "card", input: "card.json", devices: ["pixel5", "tablet"], fontScales: ["default", "a11y"] }],
    { snapsDir: "snaps", rendersDir: "renders" },
  );
  assert.equal(batch.entries.length, 4);
  assert.equal(expected.length, 4);
  assert.deepEqual(expected.map((e) => e.pngName).sort(), [
    "card_pixel5_a11y.png",
    "card_pixel5_default.png",
    "card_tablet_a11y.png",
    "card_tablet_default.png",
  ]);
  assert.equal(batch.entries[0].input, path.join("snaps", "card.json"));
  assert.ok(batch.entries[0].output.startsWith("renders"));
});

test("diffPng distinguishes pass / diff / size mismatch / missing golden", () => {
  const dir = tmpdir();
  const a = path.join(dir, "a.png");
  const same = path.join(dir, "same.png");
  const changed = path.join(dir, "changed.png");
  const bigger = path.join(dir, "bigger.png");
  writePng(a, { seed: 0 });
  writePng(same, { seed: 0 });
  writePng(changed, { seed: 7 });
  writePng(bigger, { seed: 0, width: 8 });

  assert.equal(diffPng(a, same).status, "pass");
  assert.equal(diffPng(a, changed).status, "diff");
  assert.match(diffPng(a, bigger).reason, /size/);
  assert.equal(diffPng(a, path.join(dir, "absent.png")).status, "missing-golden");
});

test("run(): record then verify round-trips green; a changed render fails", () => {
  const root = tmpdir();
  const snaps = path.join(root, "__screensnaps__");
  const goldens = path.join(root, "goldens");
  seedSnaps(snaps, [
    { name: "card", input: "card.json", devices: ["pixel5"], fontScales: ["default", "a11y"] },
  ]);
  const logs = { out: [], err: [] };
  const io = { log: (m) => logs.out.push(m), error: (m) => logs.err.push(m) };

  // record
  let code = run(["--record", snaps, "--goldens", goldens], { render: fakeRenderer(), ...io });
  assert.equal(code, 0);
  assert.ok(fs.existsSync(path.join(goldens, "card_pixel5_default.png")));
  assert.ok(fs.existsSync(path.join(goldens, "card_pixel5_a11y.png")));

  // verify against just-recorded goldens
  code = run([snaps, "--goldens", goldens], { render: fakeRenderer(), ...io });
  assert.equal(code, 0);

  // a render that drifts for one config fails with exit 1
  const drifting = fakeRenderer({ seedFor: (e) => (e.fontScale === "a11y" ? 9 : 0) });
  code = run([snaps, "--goldens", goldens], { render: drifting, ...io });
  assert.equal(code, 1);
  assert.ok(logs.out.some((l) => l.includes("✗ card_pixel5_a11y.png")));
  assert.ok(logs.out.some((l) => l.includes("✓ card_pixel5_default.png")));
});

test("run(): --filter narrows what renders; unmatched filter is a usage error", () => {
  const root = tmpdir();
  const snaps = path.join(root, "__screensnaps__");
  const goldens = path.join(root, "goldens");
  seedSnaps(snaps, [
    { name: "inboxCard", input: "inboxCard.json", devices: ["pixel5"], fontScales: ["default"] },
    { name: "profileHeader", input: "profileHeader.json", devices: ["pixel5"], fontScales: ["default"] },
  ]);
  const io = { log: () => {}, error: () => {} };

  let rendered = [];
  const trackingRenderer = (batchPath) => {
    const batch = JSON.parse(fs.readFileSync(batchPath, "utf8"));
    rendered = batch.entries.map((e) => path.basename(e.output));
    return fakeRenderer()(batchPath);
  };
  let code = run(["--record", snaps, "--goldens", goldens, "--filter", "inbox"], {
    render: trackingRenderer,
    ...io,
  });
  assert.equal(code, 0);
  assert.deepEqual(rendered, ["inboxCard_pixel5_default.png"]);

  code = run([snaps, "--goldens", goldens, "--filter", "nomatch"], { render: fakeRenderer(), ...io });
  assert.equal(code, 2);
});

test("run(): usage errors exit 2", () => {
  const io = { log: () => {}, error: () => {} };
  assert.equal(run([], { render: fakeRenderer(), ...io }), 2);
  assert.equal(run(["snaps", "--bogus"], { render: fakeRenderer(), ...io }), 2);
  assert.equal(run([path.join(tmpdir(), "missing")], { render: fakeRenderer(), ...io }), 2);
});
