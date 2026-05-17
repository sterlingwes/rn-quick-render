import { loadFabric, type FabricRuntime } from "./loadFabric";
import type { MountInstruction } from "./types";

let runtime: FabricRuntime | null = null;
let nextSurfaceId = 11;

function ensureRuntime(): FabricRuntime {
  if (!runtime) {
    // A fixture using loadRealRn() registers the resulting runtime on
    // this global before its default export is evaluated; pick it up
    // so we don't double-bootstrap Fabric.
    const preloaded = (globalThis as any).__rnHarnessFabric as FabricRuntime | undefined;
    runtime = preloaded ?? loadFabric();
  }
  return runtime;
}

export interface RenderResult {
  surfaceId: number;
  instructions: MountInstruction[];
}

// Render a React element through Fabric in Node, return the ordered instruction
// stream that would cross the JS→native boundary. Each call gets its own
// surfaceId so successive fixtures in the same process don't overlap.
export function renderFixture(element: unknown): RenderResult {
  return renderFrames([element]);
}

// Render N frames into the same surface in order. The second and later
// frames produce clone* / appendChild ops as React reconciles against the
// previous tree. Used to exercise the update path on the translator side.
export function renderFrames(elements: unknown[]): RenderResult {
  const rt = ensureRuntime();
  const surfaceId = nextSurfaceId++;

  rt.capture.reset();
  // concurrentRoot=false forces a synchronous commit so each frame's
  // instructions land before the next render call returns.
  for (const element of elements) {
    rt.ReactFabric.render(element, surfaceId, null, false);
  }
  const instructions = rt.capture.instructions.slice();
  rt.ReactFabric.stopSurface(surfaceId);

  return {
    surfaceId,
    instructions,
  };
}
