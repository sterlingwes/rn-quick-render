// rn-quick-render-jest — capture screen snapshots from inside an
// existing Jest suite.
//
// `screenSnapshot(element, opts)` re-renders the element through
// ReactFabric in the same Jest module environment as the calling test
// (so every jest.mock the test applied also applies here), records the
// nativeFabricUIManager mount-instruction stream, normalizes it, and
// writes it under the snaps directory in exactly the JSON shape the
// rn-quick-render JVM renderer consumes — plus a per-worker JSONL
// manifest line describing the requested device / font-scale matrix.
//
// Nothing renders during the test run. A separate step —
// `rn-quick-render verify <snapsDir>` — merges the manifests, renders
// over one warm JVM, and pixel-diffs against committed goldens. Keeping
// the steps decoupled lets CI filter which snapshots actually render.

import * as fs from "fs";
import * as path from "path";
import { createCapture, type Capture } from "../../rn-harness/src/captureStub";
import { normalizeInstructions } from "../../rn-harness/src/normalizeCapture";
import type { MountInstruction } from "../../rn-harness/src/types";
import { installNativeDomMock, registerPresetViewConfigs } from "./shims";

declare const expect: any;

export type ColorScheme = "light" | "dark";

export interface ScreenSnapshotOptions {
  /** Artifact base name; also the golden name the verify step diffs against. */
  name: string;
  /** Device profiles the render step fans out to. Default ["pixel5"]. */
  devices?: string[];
  /** Font-scale buckets the render step fans out to. Default ["default"]. */
  fontScales?: string[];
  /**
   * Capture once per scheme by overriding RN's useColorScheme() hook —
   * the platform API well-behaved theme systems derive from. "light"
   * writes `<name>.json`; "dark" writes `<name>__dark.json`, matching
   * the harness convention. Default: single capture with the hook
   * untouched.
   */
  colorSchemes?: ColorScheme[];
  /** Where artifacts + manifests go. Default $RN_QUICK_RENDER_SNAPS_DIR or <cwd>/__screensnaps__. */
  outDir?: string;
}

export interface CapturedArtifact {
  scheme: ColorScheme | null;
  artifactPath: string;
  instructions: MountInstruction[];
}

export interface ScreenSnapshotResult {
  /** All captures (one per requested color scheme). */
  artifacts: CapturedArtifact[];
  /** Convenience aliases for the first capture. */
  artifactPath: string;
  instructions: MountInstruction[];
}

let capture: Capture | null = null;
let ReactFabric: any = null;
let nextSurfaceId = 1001;

function ensureFabric(): void {
  if (ReactFabric) return;

  installNativeDomMock();

  capture = createCapture();
  const g = globalThis as any;
  g.nativeFabricUIManager = capture.manager;
  if (g.RN$Bridgeless === undefined) g.RN$Bridgeless = true;
  if (g.IS_REACT_ACT_ENVIRONMENT === undefined) g.IS_REACT_ACT_ENVIRONMENT = true;
  if (g.RN$registerCallableModule === undefined) g.RN$registerCallableModule = () => {};
  if (g.__nativeComponentRegistry__hasComponent === undefined) {
    g.__nativeComponentRegistry__hasComponent = () => false;
  }

  registerPresetViewConfigs();

  ReactFabric = require("react-native/Libraries/Renderer/implementations/ReactFabric-dev");
}

function assertRenderableStream(name: string, instructions: MountInstruction[]): void {
  if (!instructions.some((i) => i.op === "createNode")) {
    throw new Error(
      `screenSnapshot("${name}") captured no host components. ` +
        "The element likely rendered against mocked-out primitives " +
        "(e.g. a wholesale jest.mock of react-native).",
    );
  }
  if (!instructions.some((i) => i.op === "completeRoot")) {
    throw new Error(`screenSnapshot("${name}") never committed — no completeRoot op captured.`);
  }
}

// Override RN's useColorScheme lazy-getter with a fixed value, or
// restore the module's own descriptor when scheme is null. Property
// access is per-call under Babel's CJS interop, so components that
// imported the hook before this call still observe the override.
function withColorScheme<T>(scheme: ColorScheme | null, fn: () => T): T {
  if (scheme === null) return fn();
  const RN = require("react-native");
  const original = Object.getOwnPropertyDescriptor(RN, "useColorScheme");
  Object.defineProperty(RN, "useColorScheme", {
    value: () => scheme,
    configurable: true,
    writable: true,
  });
  try {
    return fn();
  } finally {
    if (original) Object.defineProperty(RN, "useColorScheme", original);
  }
}

function renderOnce(name: string, element: unknown): MountInstruction[] {
  ensureFabric();
  const surfaceId = nextSurfaceId++;
  capture!.reset();

  // Fabric's text-nesting DEV check keys on literal host names
  // (RCTText & co); the preset's Text mock emits 'Text', so correct
  // captures still log a spurious console.error. Scope-filter that one
  // message so suites with strict console settings don't fail.
  const realConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("Text strings must be rendered within")
    ) {
      return;
    }
    realConsoleError(...args);
  };
  try {
    // concurrentRoot=false → synchronous commit; instructions are
    // complete when render() returns.
    ReactFabric.render(element, surfaceId, null, false);
  } finally {
    console.error = realConsoleError;
  }
  const instructions = normalizeInstructions(capture!.instructions.slice());
  ReactFabric.stopSurface(surfaceId);

  assertRenderableStream(name, instructions);
  return instructions;
}

function resolveOutDir(opts: ScreenSnapshotOptions): string {
  return (
    opts.outDir ??
    process.env.RN_QUICK_RENDER_SNAPS_DIR ??
    path.join(process.cwd(), "__screensnaps__")
  );
}

function writeArtifact(
  outDir: string,
  fileName: string,
  instructions: MountInstruction[],
): string {
  const surfaceId =
    instructions
      .map((i) => ("surfaceId" in i ? (i as { surfaceId?: number }).surfaceId : undefined))
      .find((s) => s !== undefined) ?? 1;
  const artifactPath = path.join(outDir, `${fileName}.json`);
  fs.writeFileSync(
    artifactPath,
    JSON.stringify(
      { fixture: fileName, surfaceId, instructionCount: instructions.length, instructions },
      null,
      2,
    ),
  );
  return artifactPath;
}

function appendManifestLine(outDir: string, entry: Record<string, unknown>): void {
  const workerId = process.env.JEST_WORKER_ID || "0";
  fs.appendFileSync(
    path.join(outDir, `manifest-w${workerId}.jsonl`),
    JSON.stringify(entry) + "\n",
  );
}

export function screenSnapshot(
  element: unknown,
  opts: ScreenSnapshotOptions,
): ScreenSnapshotResult {
  if (!opts || !opts.name) throw new Error("screenSnapshot requires opts.name");

  const outDir = resolveOutDir(opts);
  fs.mkdirSync(outDir, { recursive: true });

  const testPath: string | undefined =
    typeof expect !== "undefined" && expect.getState?.().testPath
      ? path.relative(process.cwd(), expect.getState().testPath)
      : undefined;

  const schemes: Array<ColorScheme | null> = opts.colorSchemes?.length
    ? opts.colorSchemes
    : [null];

  const artifacts: CapturedArtifact[] = schemes.map((scheme) => {
    const suffix = scheme === "dark" ? "__dark" : "";
    const instructions = withColorScheme(scheme, () =>
      renderOnce(opts.name, element),
    );
    const artifactPath = writeArtifact(outDir, `${opts.name}${suffix}`, instructions);
    appendManifestLine(outDir, {
      name: `${opts.name}${suffix}`,
      // Relative to the manifest's own directory so the whole snaps
      // dir is relocatable (rendered on another machine, cached, …).
      input: path.basename(artifactPath),
      testPath,
      devices: opts.devices ?? ["pixel5"],
      fontScales: opts.fontScales ?? ["default"],
      ...(scheme ? { colorScheme: scheme } : {}),
    });
    return { scheme, artifactPath, instructions };
  });

  return {
    artifacts,
    artifactPath: artifacts[0].artifactPath,
    instructions: artifacts[0].instructions,
  };
}
