// Fidelity matrix: each rn-harness fixture × each config is rendered
// against a running server and diffed against its committed golden.
//
// Required env:
//   FIDELITY_SERVER         http://127.0.0.1:8080         server base URL
//   FIDELITY_API_KEY        bearer token for the namespace
//
// Optional env:
//   UPDATE_GOLDENS=1        record mode: writes goldens instead of diffing
//   FIDELITY_RN_VERSION     default 0.85.1
//   FIDELITY_DEVICE_NAME    default "iPhone 15 Pro"
//   FIDELITY_DEVICE_OS      default "17.4"
//   FIDELITY_THRESHOLD      default 0.01 (used when writing a new sidecar)
//
// When FIDELITY_SERVER is unset, the suite skips entirely — keeps CI green
// on the Linux-only `npm test` path which has no real simulator.

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  diffAgainstGolden,
  goldenPaths,
  readSidecar,
  writeGolden,
  type GoldenSidecar,
} from "../lib/golden.js";
import { render, type RenderRequestBody } from "../lib/renderClient.js";

const SERVER = process.env.FIDELITY_SERVER;
const API_KEY = process.env.FIDELITY_API_KEY;
const RECORD = process.env.UPDATE_GOLDENS === "1";
const RN_VERSION = process.env.FIDELITY_RN_VERSION ?? "0.85.1";
const DEVICE_NAME = process.env.FIDELITY_DEVICE_NAME ?? "iPhone 15 Pro";
const DEVICE_OS = process.env.FIDELITY_DEVICE_OS ?? "17.4";
const DEFAULT_THRESHOLD = Number(process.env.FIDELITY_THRESHOLD ?? 0.01);

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const FIXTURES_DIR = resolve(ROOT, "tests/fixtures");
const GOLDENS_DIR = resolve(ROOT, "tests/goldens");

// Phase 2 matrix: appearance × fontScale on iPhone 15 Pro. fontScale
// numbers map to UIKit content size categories via simctl ui content_size
// (see runner/src/runner.ts::fontScaleToContentSize). 1.0 → "large"
// (default); 3.1 → "accessibility-extra-extra-extra-large" (largest).
const CONFIGS: Array<{
  id: string;
  appearance: "light" | "dark";
  fontScale?: number;
}> = [
  { id: "light", appearance: "light" },
  { id: "dark", appearance: "dark" },
  { id: "light.xxxl", appearance: "light", fontScale: 3.1 },
  { id: "dark.xxxl", appearance: "dark", fontScale: 3.1 },
];

const fixtureFiles = SERVER
  ? (await readdir(FIXTURES_DIR)).filter((f) => f.endsWith(".json")).sort()
  : [];

describe.skipIf(!SERVER || !API_KEY)("fidelity", () => {
  for (const file of fixtureFiles) {
    const name = file.replace(/\.json$/, "");
    describe(name, () => {
      for (const cfg of CONFIGS) {
        it(cfg.id, async () => {
          const fixtureJson = JSON.parse(
            await readFile(resolve(FIXTURES_DIR, file), "utf8"),
          ) as { surfaceId: number; instructions: unknown[] };

          const body: RenderRequestBody = {
            fixture: name,
            surfaceId: fixtureJson.surfaceId,
            instructions: fixtureJson.instructions,
            rnVersion: RN_VERSION,
            device: { name: DEVICE_NAME, osVersion: DEVICE_OS },
            appearance: cfg.appearance,
            fontScale: cfg.fontScale,
          };

          const { png } = await render({ serverUrl: SERVER!, apiKey: API_KEY!, body });
          const paths = goldenPaths(GOLDENS_DIR, name, cfg.id);

          if (RECORD) {
            const sidecar: GoldenSidecar = {
              fixture: name,
              config: cfg.id,
              rnVersion: RN_VERSION,
              device: { name: DEVICE_NAME, osVersion: DEVICE_OS },
              appearance: cfg.appearance,
              fontScale: cfg.fontScale,
              threshold: DEFAULT_THRESHOLD,
            };
            await writeGolden(paths.png, paths.sidecar, png, sidecar);
            return;
          }

          const sidecar = await readSidecar(paths.sidecar);
          if (!sidecar) {
            console.warn(
              `[fidelity] no golden for ${name}/${cfg.id} — run with UPDATE_GOLDENS=1 to record`,
            );
            return;
          }

          const result = await diffAgainstGolden(paths.png, png, sidecar.threshold);
          expect(
            result.passed,
            `${name}/${cfg.id}: ${result.diffPixels}/${result.totalPixels} pixels differ (${(result.ratio * 100).toFixed(4)}%, threshold ${(result.threshold * 100).toFixed(4)}%)`,
          ).toBe(true);
        });
      }
    });
  }
});
