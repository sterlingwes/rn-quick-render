// Bundle the package to plain CJS in dist/. Bundling (rather than tsc
// per-file emit) is what lets this package single-source capture logic
// from ../rn-harness/src — the relative imports are compiled in, so the
// published artifact has no file: dependency on the private harness.
const esbuild = require("esbuild");

esbuild.buildSync({
  entryPoints: ["src/index.ts", "src/setup.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outdir: "dist",
  // Resolved from the consumer's environment at runtime, never bundled.
  external: ["react", "react-native"],
  logLevel: "info",
});

// Minimal hand-written type surface (the bundle collapses module
// structure, so per-file tsc declarations don't map 1:1).
require("fs").copyFileSync("src/index.d.ts", "dist/index.d.ts");
