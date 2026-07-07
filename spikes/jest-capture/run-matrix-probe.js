#!/usr/bin/env node
// Assemble a throwaway consumer app for a given react-native version
// and run this spike's test suite inside it — the RN version-matrix
// probe behind .github/workflows/jest-capture.yml.
//
//   node run-matrix-probe.js <rnVersion> <reactVersion> <babelPresetVersion> [jestPresetVersion]
//
// When jestPresetVersion is given, the consumer uses the standalone
// `@react-native/jest-preset` package (RN >= 0.85); otherwise it uses
// the in-package `react-native` preset (RN <= 0.84).
//
// Validated combinations (all green as of 2026-07):
//   0.85.1  19.2.5  0.85.3  0.85.1
//   0.84.1  19.2.3  0.84.1
//   0.83.10 19.2.0  0.83.10

"use strict";

const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const [rn, react, babelPreset, jestPreset] = process.argv.slice(2);
if (!rn || !react || !babelPreset) {
  console.error(
    "usage: run-matrix-probe.js <rnVersion> <reactVersion> <babelPresetVersion> [jestPresetVersion]",
  );
  process.exit(2);
}

const spikeDir = __dirname;
const pkgDir = path.resolve(spikeDir, "../../npm-jest");
const work = fs.mkdtempSync(path.join(os.tmpdir(), `rqr-matrix-${rn.replace(/\./g, "-")}-`));
console.log(`[matrix ${rn}] consumer dir: ${work}`);

for (const item of ["src", "__tests__", "babel.config.js"]) {
  fs.cpSync(path.join(spikeDir, item), path.join(work, item), { recursive: true });
}

const devDependencies = {
  "@react-native/babel-preset": babelPreset,
  "babel-jest": "29.7.0",
  jest: "29.7.0",
  "react-test-renderer": "19.2.0",
  "rn-quick-render-jest": `file:${pkgDir}`,
};
if (jestPreset) devDependencies["@react-native/jest-preset"] = jestPreset;

fs.writeFileSync(
  path.join(work, "package.json"),
  JSON.stringify(
    {
      name: `rqr-matrix-probe-rn${rn.replace(/\./g, "-")}`,
      private: true,
      dependencies: { react, "react-native": rn },
      devDependencies,
    },
    null,
    2,
  ),
);
fs.writeFileSync(
  path.join(work, "jest.config.js"),
  `module.exports = { preset: ${JSON.stringify(
    jestPreset ? "@react-native/jest-preset" : "react-native",
  )} };\n`,
);
// Copy file: deps into node_modules instead of symlinking — matches the
// published-install layout (the package resolves react-native from the
// consumer, and the consumer's transformIgnorePatterns applies).
fs.writeFileSync(path.join(work, ".npmrc"), "install-links=true\n");

const sh = (cmd) => execSync(cmd, { cwd: work, stdio: "inherit" });
sh("npm install --no-audit --no-fund");
sh("npx jest");
console.log(`[matrix ${rn}] PASS`);
