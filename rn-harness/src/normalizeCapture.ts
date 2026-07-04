import type { MountInstruction } from "./types";

// Fabric assigns reactTags and surfaceIds monotonically per *process*,
// so the same element captured after N prior captures embeds different
// tag/surface values. That's why fixtures historically had to be
// captured in a stable order ("append at the end or every golden
// shifts"), and it's a hard blocker for capturing from inside a test
// suite, where execution order is arbitrary.
//
// Renumbering both to a canonical per-capture sequence makes an
// artifact a pure function of the rendered element: byte-identical no
// matter what rendered before it. nodeId / childSetId are already
// per-capture (the capture stub resets them), so only `tag` and
// `surfaceId` need remapping.
//
// Tags are renumbered by first appearance to 2, 4, 6, … mirroring
// Fabric's even-numbered non-root tag convention so normalized streams
// stay plausible to consumers that know that convention. Surface ids
// renumber to 1, 2, … (multi-surface captures are rare but legal).
export function normalizeInstructions(
  instructions: MountInstruction[],
): MountInstruction[] {
  const tagMap = new Map<number, number>();
  const surfaceMap = new Map<number, number>();
  let nextTag = 2;
  let nextSurface = 1;

  const mapTag = (tag: number): number => {
    let mapped = tagMap.get(tag);
    if (mapped === undefined) {
      mapped = nextTag;
      nextTag += 2;
      tagMap.set(tag, mapped);
    }
    return mapped;
  };
  const mapSurface = (surfaceId: number): number => {
    let mapped = surfaceMap.get(surfaceId);
    if (mapped === undefined) {
      mapped = nextSurface;
      nextSurface += 1;
      surfaceMap.set(surfaceId, mapped);
    }
    return mapped;
  };

  return instructions.map((ins): MountInstruction => {
    switch (ins.op) {
      case "createNode":
        return { ...ins, tag: mapTag(ins.tag), surfaceId: mapSurface(ins.surfaceId) };
      case "createChildSet":
        return ins.surfaceId === undefined
          ? ins
          : { ...ins, surfaceId: mapSurface(ins.surfaceId) };
      case "completeRoot":
        return { ...ins, surfaceId: mapSurface(ins.surfaceId) };
      default:
        return ins;
    }
  });
}
