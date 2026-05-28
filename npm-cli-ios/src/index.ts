#!/usr/bin/env node
import { Command } from "commander";

import { assetsCommand } from "./commands/assets.js";
import { captureCommand } from "./commands/capture.js";
import { diffCommand } from "./commands/diff.js";
import { matrixCommand } from "./commands/matrix.js";
import { renderCommand } from "./commands/render.js";
import { snapshotCommand } from "./commands/snapshot.js";

const program = new Command();
program
  .name("rn-quick-render-ios")
  .description("iOS Fabric snapshot CLI — captures via rn-harness, renders via HTTP API")
  .version("0.1.0-prealpha.0");

program.addCommand(captureCommand());
program.addCommand(renderCommand());
program.addCommand(snapshotCommand());
program.addCommand(matrixCommand());
program.addCommand(assetsCommand());
program.addCommand(diffCommand());

program.parseAsync().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
