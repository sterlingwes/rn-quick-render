import type { MountInstruction } from "./types";

// Real RN's <ScrollView> always mounts an RCTScrollContentView between
// the RCTScrollView and its content, and both render engines assume
// that pair (the Android builder treats the scroll node's first child
// as *the* content wrapper and ignores siblings). The Jest preset's
// ScrollView mock emits a single host node with the children attached
// directly, so captures from consumer test suites would silently drop
// every child but the first. Synthesize the canonical wrapper at the
// capture side so both engines see the real-RN shape.
//
// Scope: initial-mount streams only. Streams containing clone* ops
// (update-path captures) pass through untouched — re-parenting inside
// an update sequence has ambiguous semantics and no consumer yet.
export function synthesizeScrollContentViews(
  instructions: MountInstruction[],
): MountInstruction[] {
  if (instructions.some((i) => i.op.startsWith("cloneNode"))) return instructions;

  const viewNameOf = new Map<number, string>();
  let maxNodeId = 0;
  let maxTag = 0;
  for (const ins of instructions) {
    if (ins.op === "createNode") {
      viewNameOf.set(ins.nodeId, ins.viewName);
      if (ins.nodeId > maxNodeId) maxNodeId = ins.nodeId;
      if (ins.tag > maxTag) maxTag = ins.tag;
    }
  }

  const childrenOf = new Map<number, number[]>();
  for (const ins of instructions) {
    if (ins.op === "appendChild") {
      const kids = childrenOf.get(ins.parentNodeId) ?? [];
      kids.push(ins.childNodeId);
      childrenOf.set(ins.parentNodeId, kids);
    }
  }

  const needsWrap = new Set<number>();
  for (const [nodeId, viewName] of viewNameOf) {
    if (viewName !== "RCTScrollView") continue;
    const kids = childrenOf.get(nodeId) ?? [];
    const alreadyCanonical =
      kids.length === 1 && viewNameOf.get(kids[0]) === "RCTScrollContentView";
    if (!alreadyCanonical) needsWrap.add(nodeId);
  }
  if (needsWrap.size === 0) return instructions;

  const wrapperFor = new Map<number, number>(); // scroll nodeId → wrapper nodeId
  const out: MountInstruction[] = [];
  for (const ins of instructions) {
    if (ins.op === "createNode" && needsWrap.has(ins.nodeId)) {
      out.push(ins);
      const wrapperId = ++maxNodeId;
      maxTag += 2;
      wrapperFor.set(ins.nodeId, wrapperId);
      out.push({
        op: "createNode",
        nodeId: wrapperId,
        tag: maxTag,
        viewName: "RCTScrollContentView",
        surfaceId: ins.surfaceId,
        props: {},
      });
      // Attach immediately — the wrapper exists from this point on, and
      // its own children may be re-parented onto it by later ops.
      out.push({ op: "appendChild", parentNodeId: ins.nodeId, childNodeId: wrapperId });
      continue;
    }
    if (ins.op === "appendChild" && wrapperFor.has(ins.parentNodeId)) {
      out.push({ ...ins, parentNodeId: wrapperFor.get(ins.parentNodeId)! });
      continue;
    }
    out.push(ins);
  }
  return out;
}

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
