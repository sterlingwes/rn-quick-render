import { mkdir, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { Command } from "commander";

import { captureFixture } from "./capture.js";
import { addConnOptions, makeClient, renderFixture, type RenderOpts } from "./render.js";

interface SnapshotOpts extends RenderOpts {
  jsonOut?: string;
  bootstrapTimeoutMs: number;
}

export function snapshotCommand(): Command {
  const cmd = new Command("snapshot")
    .description("Capture a fixture and render it to PNG in one step (capture → render)")
    .argument("<fixture.tsx>", "path to a .ts/.tsx fixture")
    .requiredOption("--out <path>", "where to write the PNG")
    .option(
      "--json-out <path>",
      "where to write the captured instructions JSON (default: alongside the PNG)",
    )
    .option("--device <name>", "device name", "iPhone 15 Pro")
    .option("--rn-version <version>", "RN version", "0.85.1")
    .option("--ios-version <version>", "iOS runtime version", "17.4")
    .option("--appearance <mode>", "light | dark", "light")
    .option("--locale <locale>", "BCP-47 locale tag", "en-US")
    .option("--asset-bundle <id>", "previously uploaded assetBundleId")
    .option("--timeout-ms <ms>", "render poll timeout", (v) => Number(v), 60_000)
    .option(
      "--bootstrap-timeout-ms <ms>",
      "capture bootstrap timeout (cold-start RN can take >60s)",
      (v) => Number(v),
      180_000,
    );

  return addConnOptions(cmd).action(async (fixturePath: string, opts: SnapshotOpts) => {
    // Force credentials check up-front so we don't capture then fail at submit.
    makeClient(opts);

    const pngOut = resolve(opts.out);
    const fixtureName = basename(fixturePath).replace(/\.(tsx?|jsx?)$/i, "");
    const jsonOut = resolve(opts.jsonOut ?? `${dirname(pngOut)}/${fixtureName}.json`);

    await mkdir(dirname(jsonOut), { recursive: true });
    await mkdir(dirname(pngOut), { recursive: true });

    const captured = await captureFixture(resolve(fixturePath), jsonOut, {
      appearance: opts.appearance,
      timeoutMs: opts.bootstrapTimeoutMs,
    });
    process.stdout.write(`captured ${captured.instructionCount} instructions → ${jsonOut}\n`);

    const fixture = JSON.parse(await readFile(jsonOut, "utf8"));
    const { id, bytes } = await renderFixture(fixture, pngOut, opts);
    process.stdout.write(`${id} → ${pngOut} (${bytes} bytes)\n`);
  });
}
