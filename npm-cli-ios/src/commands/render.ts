import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { Command } from "commander";

import { ServerClient } from "../serverClient.js";

export interface ConnOpts {
  server: string;
  apiKey?: string;
}

export interface RenderOpts extends ConnOpts {
  device: string;
  rnVersion: string;
  iosVersion: string;
  appearance: string;
  locale: string;
  assetBundle?: string;
  out: string;
  timeoutMs: number;
}

export function addConnOptions(cmd: Command): Command {
  return cmd
    .option(
      "--server <url>",
      "server base URL",
      process.env.RN_QUICK_RENDER_IOS_SERVER ?? "http://127.0.0.1:8080",
    )
    .option("--api-key <key>", "API key", process.env.RN_QUICK_RENDER_IOS_API_KEY);
}

export function makeClient(opts: ConnOpts): ServerClient {
  if (!opts.apiKey) {
    throw new Error("--api-key or RN_QUICK_RENDER_IOS_API_KEY required");
  }
  return new ServerClient({ baseUrl: opts.server, apiKey: opts.apiKey });
}

export interface FixtureJson {
  fixture?: string;
  surfaceId: number;
  instructions: unknown[];
}

export async function renderFixture(
  fixture: FixtureJson,
  outPath: string,
  opts: Omit<RenderOpts, "out">,
): Promise<{ id: string; bytes: number }> {
  const client = makeClient(opts);
  const submitted = await client.submitRender({
    fixture: fixture.fixture,
    surfaceId: fixture.surfaceId,
    instructions: fixture.instructions,
    rnVersion: opts.rnVersion,
    assetBundleId: opts.assetBundle,
    device: { name: opts.device, osVersion: opts.iosVersion },
    appearance: opts.appearance,
    locale: opts.locale,
  });
  const final = await client.pollUntilSettled(submitted.id, { timeoutMs: opts.timeoutMs });
  if (final.status === "failed" || !final.url) {
    throw new Error(`render ${final.id} failed: ${final.error?.message ?? "no url"}`);
  }
  const png = await client.downloadPng(final.url);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, png);
  return { id: final.id, bytes: png.byteLength };
}

export function renderCommand(): Command {
  const cmd = new Command("render")
    .description("Submit a captured fixture JSON to the server and download the resulting PNG")
    .argument("<fixture.json>", "path to instructions JSON produced by `capture`")
    .requiredOption("--device <name>", 'device name e.g. "iPhone 15 Pro"')
    .requiredOption("--rn-version <version>", "RN version the host app was built against")
    .option("--ios-version <version>", "iOS runtime version", "17.4")
    .option("--appearance <mode>", "light | dark", "light")
    .option("--locale <locale>", "BCP-47 locale tag", "en-US")
    .option("--asset-bundle <id>", "previously uploaded assetBundleId")
    .requiredOption("--out <path>", "where to write the PNG")
    .option("--timeout-ms <ms>", "client poll timeout", (v) => Number(v), 60_000);

  return addConnOptions(cmd).action(async (fixturePath: string, opts: RenderOpts) => {
    const raw = await readFile(resolve(fixturePath), "utf8");
    const fixture = JSON.parse(raw) as FixtureJson;
    const { id, bytes } = await renderFixture(fixture, resolve(opts.out), opts);
    process.stdout.write(`${id} → ${opts.out} (${bytes} bytes)\n`);
  });
}
