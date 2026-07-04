import { normalizeInstructions } from "../src/normalizeCapture";
import type { MountInstruction } from "../src/types";

// A stream as Fabric would emit it mid-process: tags offset by prior
// renders (34, 36, …), surfaceId 17.
function offsetStream(tagBase: number, surfaceId: number): MountInstruction[] {
  return [
    { op: "createNode", nodeId: 1, tag: tagBase, viewName: "RCTRawText", surfaceId, props: { text: "hi" } },
    { op: "createNode", nodeId: 2, tag: tagBase + 2, viewName: "RCTText", surfaceId, props: { style: {} } },
    { op: "appendChild", parentNodeId: 2, childNodeId: 1 },
    { op: "createNode", nodeId: 3, tag: tagBase + 4, viewName: "RCTView", surfaceId, props: {} },
    { op: "appendChild", parentNodeId: 3, childNodeId: 2 },
    { op: "createChildSet", childSetId: 1 },
    { op: "appendChildToSet", childSetId: 1, childNodeId: 3 },
    { op: "completeRoot", surfaceId, childSetId: 1 },
  ];
}

test("the same element captured at different process offsets normalizes identically", () => {
  const first = normalizeInstructions(offsetStream(2, 11));
  const later = normalizeInstructions(offsetStream(346, 42));
  expect(later).toEqual(first);
});

test("tags renumber by first appearance to 2, 4, 6…; surfaces to 1, 2…", () => {
  const normalized = normalizeInstructions(offsetStream(100, 17));
  const creates = normalized.filter(
    (i): i is Extract<MountInstruction, { op: "createNode" }> => i.op === "createNode",
  );
  expect(creates.map((i) => i.tag)).toEqual([2, 4, 6]);
  expect(creates.every((i) => i.surfaceId === 1)).toBe(true);
  const complete = normalized.find((i) => i.op === "completeRoot");
  expect(complete).toMatchObject({ surfaceId: 1 });
});

test("repeated tags map consistently and distinct surfaces stay distinct", () => {
  const stream: MountInstruction[] = [
    { op: "createNode", nodeId: 1, tag: 50, viewName: "RCTView", surfaceId: 9, props: {} },
    { op: "createNode", nodeId: 2, tag: 52, viewName: "RCTView", surfaceId: 9, props: {} },
    // Same tag re-created (update path re-uses tags across frames).
    { op: "createNode", nodeId: 3, tag: 50, viewName: "RCTView", surfaceId: 9, props: {} },
    { op: "completeRoot", surfaceId: 9, childSetId: 1 },
    // A second surface in the same capture.
    { op: "createNode", nodeId: 4, tag: 60, viewName: "RCTView", surfaceId: 12, props: {} },
    { op: "completeRoot", surfaceId: 12, childSetId: 2 },
  ];
  const normalized = normalizeInstructions(stream);
  const creates = normalized.filter(
    (i): i is Extract<MountInstruction, { op: "createNode" }> => i.op === "createNode",
  );
  expect(creates.map((i) => i.tag)).toEqual([2, 4, 2, 6]);
  expect(creates.map((i) => i.surfaceId)).toEqual([1, 1, 1, 2]);
});

test("ops without tags/surfaces pass through untouched; createChildSet without surfaceId stays bare", () => {
  const stream: MountInstruction[] = [
    { op: "registerEventHandler" },
    { op: "createChildSet", childSetId: 1 },
    { op: "createChildSet", childSetId: 2, surfaceId: 33 },
    { op: "cloneNodeWithNewProps", nodeId: 5, sourceNodeId: 4, newProps: { a: 1 } },
  ];
  const normalized = normalizeInstructions(stream);
  expect(normalized[0]).toEqual({ op: "registerEventHandler" });
  expect(normalized[1]).toEqual({ op: "createChildSet", childSetId: 1 });
  expect(normalized[2]).toEqual({ op: "createChildSet", childSetId: 2, surfaceId: 1 });
  expect(normalized[3]).toEqual(stream[3]);
});
