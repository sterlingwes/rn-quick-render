#!/usr/bin/env node
//
// Node wrapper around the JVM renderer.
//
// Default: all CLI args are forwarded verbatim to `Main.kt`:
//   one-shot: rn-quick-render [--width W] [--height H] [--density D]
//                             [--output FILE] [--fonts DIR] [--fontScale N]
//   batch:    rn-quick-render --batch path/to/manifest.json
//
// Subcommand: render + pixel-diff the artifacts a Jest run emitted via
// rn-quick-render-jest:
//   rn-quick-render verify <snapsDir> [--goldens DIR] [--record]
//                    [--filter SUBSTR] [--test-path SUBSTR] [--fonts DIR]
//
// The launcher (lib/launcher.js) locates the staged jars, native libs,
// and layoutlib data under `dist/`, validates that a Java 17+ runtime
// is available, and execs `java`. See npm-cli/README.md for detail.

"use strict";

const args = process.argv.slice(2);

if (args[0] === "verify") {
  process.exit(require("../lib/verify").run(args.slice(1)));
} else {
  require("../lib/launcher").launch(args);
}
