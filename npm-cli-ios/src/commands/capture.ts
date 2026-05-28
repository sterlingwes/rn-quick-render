import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { Command } from "commander";

const execFileAsync = promisify(execFile);

export interface CaptureResult {
  fixture: string;
  surfaceId: number;
  instructionCount: number;
  instructions: unknown[];
}

export function captureCommand(): Command {
  return new Command("capture")
    .description("Capture Fabric mount instructions from a component fixture to JSON")
    .argument("<fixture.ts>", "path to a .ts/.tsx fixture (default export = React element)")
    .requiredOption("--out <path>", "where to write the instructions JSON")
    .option("--appearance <mode>", "light | dark — color scheme at capture time", "light")
    .option(
      "--bootstrap-timeout-ms <ms>",
      "max time to wait for the harness bootstrap (cold-start RN can take >60s)",
      (v) => Number(v),
      180_000,
    )
    .action(async (fixturePath: string, opts: { out: string; appearance: string; bootstrapTimeoutMs: number }) => {
      const result = await captureFixture(resolve(fixturePath), resolve(opts.out), {
        appearance: opts.appearance,
        timeoutMs: opts.bootstrapTimeoutMs,
      });
      process.stdout.write(`captured ${result.instructionCount} instructions → ${opts.out}\n`);
    });
}

export async function captureFixture(
  fixturePath: string,
  outPath: string,
  opts: { appearance: string; timeoutMs?: number } = { appearance: "light" },
): Promise<CaptureResult> {
  await mkdir(dirname(outPath), { recursive: true });

  const packageRoot = resolve(__dirname, "..", "..");
  const bootstrapScript = resolve(packageRoot, "scripts", "capture-bootstrap.cjs");
  const harnessRoot = resolveHarnessRoot(packageRoot);
  const tsNodeRegister = require.resolve("ts-node/register", { paths: [packageRoot] });

  const { stderr } = await execFileAsync(
    process.execPath,
    [
      "-r",
      tsNodeRegister,
      bootstrapScript,
      fixturePath,
      "--out",
      outPath,
      "--appearance",
      opts.appearance,
    ],
    {
      cwd: harnessRoot,
      env: {
        ...process.env,
        RN_HARNESS_ROOT: harnessRoot,
        TS_NODE_PROJECT: resolve(harnessRoot, "tsconfig.json"),
        TS_NODE_TRANSPILE_ONLY: "true",
        // Let fixtures resolve `react-native` and other harness-side deps
        // from their own file location, regardless of where the fixture
        // lives on disk.
        NODE_PATH: [
          resolve(harnessRoot, "node_modules"),
          process.env.NODE_PATH,
        ]
          .filter(Boolean)
          .join(":"),
      },
      maxBuffer: 50 * 1024 * 1024,
      timeout: opts.timeoutMs ?? 180_000,
    },
  );

  if (stderr) process.stderr.write(stderr);

  const raw = await readFile(outPath, "utf8");
  return JSON.parse(raw) as CaptureResult;
}

function resolveHarnessRoot(packageRoot: string): string {
  if (process.env.RN_HARNESS_ROOT) return process.env.RN_HARNESS_ROOT;
  try {
    return dirname(require.resolve("rn-harness/package.json", { paths: [packageRoot] }));
  } catch {
    return resolve(packageRoot, "..", "rn-harness");
  }
}
