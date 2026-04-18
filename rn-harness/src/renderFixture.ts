import { loadFabric, type FabricRuntime } from "./loadFabric";
import type { MountInstruction } from "./types";

let runtime: FabricRuntime | null = null;
let nextSurfaceId = 11;

function ensureRuntime(): FabricRuntime {
  if (!runtime) runtime = loadFabric();
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
  const rt = ensureRuntime();
  const surfaceId = nextSurfaceId++;

  rt.capture.reset();
  // concurrentRoot=false forces a synchronous commit so the instruction
  // stream is complete by the time render() returns. Concurrent mode
  // schedules work on the scheduler and would require us to flush manually.
  rt.ReactFabric.render(element, surfaceId, null, false);
  const instructions = rt.capture.instructions.slice();
  rt.ReactFabric.stopSurface(surfaceId);

  return {
    surfaceId,
    instructions,
  };
}
