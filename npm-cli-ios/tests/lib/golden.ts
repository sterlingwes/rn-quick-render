// Golden file conventions for the fidelity suite.
//
//   tests/goldens/<fixture>/<config>.png    — committed reference
//   tests/goldens/<fixture>/<config>.json   — sidecar pinning device /
//                                             appearance / fontScale /
//                                             rnVersion / threshold
//
// `<config>` is a compact string that encodes the matrix dims being
// flipped, e.g. "light", "dark", "light.xl", "dark.xl". The fixture's
// own name (which may carry the harness's `__dark` suffix for content
// captured under a dark JS scheme) is orthogonal — config drives the
// chrome / runtime overrides we pass to the API.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export interface GoldenSidecar {
  fixture: string;
  config: string;
  rnVersion: string;
  device: { name: string; osVersion: string };
  appearance: "light" | "dark";
  fontScale?: number;
  threshold: number;
}

export interface DiffResult {
  passed: boolean;
  diffPixels: number;
  totalPixels: number;
  ratio: number;
  threshold: number;
}

export function goldenPaths(rootDir: string, fixture: string, config: string) {
  const dir = resolve(rootDir, fixture);
  return {
    dir,
    png: resolve(dir, `${config}.png`),
    sidecar: resolve(dir, `${config}.json`),
  };
}

export async function readSidecar(path: string): Promise<GoldenSidecar | undefined> {
  if (!existsSync(path)) return undefined;
  return JSON.parse(await readFile(path, "utf8")) as GoldenSidecar;
}

export async function writeGolden(
  pngPath: string,
  sidecarPath: string,
  png: Buffer,
  sidecar: GoldenSidecar,
): Promise<void> {
  await mkdir(dirname(pngPath), { recursive: true });
  await writeFile(pngPath, png);
  await writeFile(sidecarPath, JSON.stringify(sidecar, null, 2) + "\n");
}

export async function diffAgainstGolden(
  goldenPngPath: string,
  candidate: Buffer,
  threshold: number,
): Promise<DiffResult> {
  const goldenBuf = await readFile(goldenPngPath);
  const a = PNG.sync.read(goldenBuf);
  const b = PNG.sync.read(candidate);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `dimension mismatch: golden ${a.width}x${a.height}, candidate ${b.width}x${b.height}`,
    );
  }
  const totalPixels = a.width * a.height;
  const diffPixels = pixelmatch(a.data, b.data, undefined, a.width, a.height, { threshold: 0.1 });
  const ratio = diffPixels / totalPixels;
  return { passed: ratio <= threshold, diffPixels, totalPixels, ratio, threshold };
}
