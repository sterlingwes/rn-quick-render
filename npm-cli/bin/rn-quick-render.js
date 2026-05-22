#!/usr/bin/env node
//
// Node wrapper around the JVM renderer. Locates the staged jars,
// native libs, and layoutlib data under `../dist/`, validates that
// a Java 17+ runtime is on PATH, and execs `java` with the
// right `-D` properties + classpath.
//
// All CLI args are forwarded verbatim to `Main.kt`:
//   one-shot: rn-quick-render [--width W] [--height H] [--density D]
//                             [--output FILE] [--fonts DIR] [--fontScale N]
//   batch:    rn-quick-render --batch path/to/manifest.json
//
// See npm-cli/README.md or `--help` for usage detail.
//
// Single-platform package for now — the dist/ directory carries
// the build host's native libs. Multi-platform packaging will
// add optionalDependencies-based per-platform sub-packages.

"use strict";

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PKG_ROOT = path.resolve(__dirname, "..");
const MAIN_CLASS = "com.example.renderer.MainKt";
const MIN_JAVA_MAJOR = 17;

main();

function main() {
  const dist = resolveDist();
  const java = resolveJava();
  ensureJavaMajor(java, MIN_JAVA_MAJOR);
  const platformSubdir = pickPlatformSubdir();
  const libPath = composeLibraryPath(dist, platformSubdir);
  const classpath = composeClasspath(dist);

  const jvmArgs = [
    "-cp", classpath,
    `-Djava.library.path=${libPath}`,
    `-Dlayoutlib.data=${path.join(dist, "layoutlib-data", "data")}`,
    `-Dlayoutlib.resources=${path.join(dist, "layoutlib-resources")}`,
    MAIN_CLASS,
    ...process.argv.slice(2),
  ];

  const child = spawn(java, jvmArgs, { stdio: "inherit" });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
  child.on("error", (err) => {
    console.error(`rn-quick-render: failed to launch java: ${err.message}`);
    process.exit(127);
  });
}

// Find the staged dist directory. Production npm packages publish
// `dist/`; dev builds emit `dist-<platform>/` so multiple cross-target
// builds can coexist. Look at the runtime host's per-target dir first;
// fall back to a plain `dist/` (the published layout).
function resolveDist() {
  const host = pickPlatformSubdir();
  const perTarget = path.join(PKG_ROOT, `dist-${host}`);
  if (fs.existsSync(path.join(perTarget, "build-info.json"))) return perTarget;

  const generic = path.join(PKG_ROOT, "dist");
  if (fs.existsSync(path.join(generic, "build-info.json"))) return generic;

  console.error(
    "rn-quick-render: package is missing its staged runtime. " +
      `Looked for ${perTarget} and ${generic}. If you're running from a ` +
      "development checkout, run `./gradlew :renderer:packageForNpm` " +
      `(or \`-Ptarget=linux\` etc. for a cross-target stage).`,
  );
  process.exit(1);
}

function resolveJava() {
  // Prefer JAVA_HOME when set (matches Gradle / Maven conventions).
  if (process.env.JAVA_HOME) {
    const candidate = path.join(process.env.JAVA_HOME, "bin", "java");
    if (fs.existsSync(candidate)) return candidate;
  }
  return "java"; // fall back to PATH
}

function ensureJavaMajor(java, minMajor) {
  const probe = spawnSync(java, ["-version"], { encoding: "utf8" });
  if (probe.status !== 0) {
    console.error(
      `rn-quick-render: couldn't run \`${java} -version\`. ` +
        `Install JDK ${minMajor}+ or set JAVA_HOME to a compatible JDK.`,
    );
    process.exit(127);
  }
  // `java -version` prints to stderr. First line:
  //   openjdk version "17.0.18" 2024-10-15
  //   openjdk version "1.8.0_392" 2023-10-17
  const first = (probe.stderr || probe.stdout || "").split("\n")[0] || "";
  const m = first.match(/version "([^"]+)"/);
  if (!m) {
    console.error(`rn-quick-render: couldn't parse Java version from: ${first.trim()}`);
    process.exit(127);
  }
  const versionStr = m[1];
  const major = parseJavaMajor(versionStr);
  if (major < minMajor) {
    console.error(
      `rn-quick-render: requires Java ${minMajor}+, found ${versionStr} ` +
        `(major ${major}). Upgrade JDK or set JAVA_HOME to a newer install.`,
    );
    process.exit(127);
  }
}

function parseJavaMajor(versionStr) {
  // Java 9+: "17.0.18" → 17; legacy: "1.8.0_392" → 8.
  if (versionStr.startsWith("1.")) {
    return parseInt(versionStr.split(".")[1], 10) || 0;
  }
  return parseInt(versionStr.split(".")[0], 10) || 0;
}

function pickPlatformSubdir() {
  const platform = os.platform();
  const arch = os.arch();
  if (platform === "darwin") return arch === "arm64" ? "mac-arm" : "mac";
  if (platform === "win32") return "win";
  return "linux";
}

function composeLibraryPath(dist, platformSubdir) {
  const layoutlibNative = path.join(dist, "layoutlib-data", "data", platformSubdir, "lib64");
  if (!fs.existsSync(layoutlibNative)) {
    // Staged package's native libs don't match the runtime host.
    // Surface clearly rather than letting JVM produce "library not found".
    const buildInfo = readBuildInfo(dist);
    console.error(
      `rn-quick-render: this package was staged for "${buildInfo.platform}" ` +
        `but the current host is "${platformSubdir}". Re-run ` +
        "`./gradlew :renderer:packageForNpm` (or `-Ptarget=<platform>`) " +
        "for a matching host, or wait for the multi-platform package " +
        "layout (phase 5 step 3b).",
    );
    process.exit(127);
  }
  const nativeDir = path.join(dist, "native");
  return [nativeDir, layoutlibNative].join(path.delimiter);
}

function composeClasspath(dist) {
  const libDir = path.join(dist, "lib");
  const jars = fs
    .readdirSync(libDir)
    .filter((f) => f.endsWith(".jar"))
    .map((j) => path.join(libDir, j));
  if (jars.length === 0) {
    console.error(`rn-quick-render: no jars found in ${libDir}. Re-stage with packageForNpm.`);
    process.exit(1);
  }
  return jars.join(path.delimiter);
}

function readBuildInfo(dist) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dist, "build-info.json"), "utf8"));
  } catch {
    return { platform: "unknown" };
  }
}
