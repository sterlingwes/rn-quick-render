import { act } from "react";
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

// Opt-in fixture shape for concurrent-root capture. `settle` is invoked
// between the fallback commit and the resolved commit; it should resolve
// any promises a Suspense-throwing hook is waiting on. React.act() pumps
// the scheduler around both phases so the second completeRoot lands
// inside the captured stream.
export interface ConcurrentFixture {
  type: "concurrent";
  element: unknown;
  settle?: () => Promise<void> | void;
}

export function isConcurrentFixture(x: unknown): x is ConcurrentFixture {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as { type?: unknown }).type === "concurrent"
  );
}

export async function renderConcurrent(
  fixture: ConcurrentFixture,
): Promise<RenderResult> {
  const rt = ensureRuntime();
  const surfaceId = nextSurfaceId++;

  rt.capture.reset();
  // Two-phase flush. The fallback commit needs to fully land (so React
  // wires up the Suspense ping handler) before settle() resolves the
  // suspended promise — otherwise the resolved commit is dropped. The
  // trailing setImmediate inside the second act drains the
  // MessageChannel-scheduled re-renders triggered by the ping so they
  // don't leak past the act() boundary and warn.
  await act(async () => {
    rt.ReactFabric.render(fixture.element, surfaceId, null, true);
  });
  if (fixture.settle) {
    await act(async () => {
      await fixture.settle?.();
      await new Promise<void>((resolve) => setImmediate(resolve));
    });
  }

  const instructions = rt.capture.instructions.slice();
  // stopSurface schedules an unmount; wrap it so the teardown work
  // doesn't trip React's "update outside act" warning.
  await act(async () => {
    rt.ReactFabric.stopSurface(surfaceId);
  });

  return {
    surfaceId,
    instructions,
  };
}
