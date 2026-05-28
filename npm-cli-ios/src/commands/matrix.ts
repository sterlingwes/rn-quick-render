import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { Command } from "commander";

import { ServerClient } from "../serverClient.js";
import { addConnOptions, makeClient, type ConnOpts } from "./render.js";

interface DeviceEntry {
  id: string;
  name: string;
  appearance?: "light" | "dark";
}

interface Fixture {
  fixture?: string;
  surfaceId: number;
  instructions: unknown[];
}

interface MatrixOpts extends ConnOpts {
  devices: string;
  out: string;
  rnVersion: string;
  iosVersion: string;
  concurrency: number;
  timeoutMs: number;
}

export function matrixCommand(): Command {
  const cmd = new Command("matrix")
    .description("Render one fixture across every device in devices.json")
    .argument("<fixture.json>", "path to fixture instructions JSON")
    .option("--devices <path>", "path to devices.json", "devices.json")
    .option("--out <dir>", "output directory (one PNG per device.id)", "matrix")
    .option("--rn-version <version>", "RN version", "0.85.1")
    .option("--ios-version <version>", "iOS runtime version", "17.4")
    .option(
      "--concurrency <n>",
      "max in-flight submissions (the server still serialises against its own pool)",
      (v) => Number(v),
      4,
    )
    .option("--timeout-ms <ms>", "per-render poll timeout", (v) => Number(v), 120_000);

  return addConnOptions(cmd).action(async (fixturePath: string, opts: MatrixOpts) => {
    const client: ServerClient = makeClient(opts);
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as Fixture;
    const devices = JSON.parse(await readFile(opts.devices, "utf8")) as DeviceEntry[];
    if (devices.length === 0) {
      throw new Error(`${opts.devices} contains no devices`);
    }
    const outDir = resolve(opts.out);
    await mkdir(outDir, { recursive: true });

    const results: { deviceId: string; path: string; bytes: number }[] = [];
    const failures: { deviceId: string; error: string }[] = [];

    const queue = [...devices];
    const workers: Promise<void>[] = [];
    const workerCount = Math.min(opts.concurrency, devices.length);
    for (let i = 0; i < workerCount; i++) {
      workers.push(
        (async () => {
          for (;;) {
            const device = queue.shift();
            if (!device) return;
            try {
              const submitted = await client.submitRender({
                fixture: fixture.fixture,
                surfaceId: fixture.surfaceId,
                instructions: fixture.instructions,
                rnVersion: opts.rnVersion,
                device: { name: device.name, osVersion: opts.iosVersion },
                appearance: device.appearance,
              });
              const final = await client.pollUntilSettled(submitted.id, {
                timeoutMs: opts.timeoutMs,
              });
              if (final.status !== "succeeded" || !final.url) {
                failures.push({
                  deviceId: device.id,
                  error: final.error?.message ?? "no url returned",
                });
                continue;
              }
              const png = await client.downloadPng(final.url);
              const outPath = join(outDir, `${device.id}.png`);
              await writeFile(outPath, png);
              results.push({ deviceId: device.id, path: outPath, bytes: png.byteLength });
              process.stdout.write(`${device.id} → ${outPath} (${png.byteLength} bytes)\n`);
            } catch (err) {
              failures.push({
                deviceId: device.id,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        })(),
      );
    }
    await Promise.all(workers);

    if (failures.length > 0) {
      process.stderr.write(`\n${failures.length} of ${devices.length} renders failed:\n`);
      for (const f of failures) {
        process.stderr.write(`  ${f.deviceId}: ${f.error}\n`);
      }
      process.exit(1);
    }
    process.stdout.write(`\n${results.length}/${devices.length} renders ok\n`);
  });
}
