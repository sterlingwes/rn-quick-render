import type { MountInstruction } from "./types";

// Each captured ShadowNode is an opaque pointer in real Fabric. We use a small
// numeric id here so the JSON stream is human-readable and stable across runs.
export interface ShadowNodeRef {
  __node: true;
  id: number;
  tag: number;
  viewName: string;
  surfaceId: number;
}

export interface ChildSetRef {
  __childSet: true;
  id: number;
  surfaceId: number;
}

export interface NativeFabricUIManagerStub {
  createNode: (tag: number, viewName: string, surfaceId: number, props: unknown, eventEmitter: unknown) => ShadowNodeRef;
  cloneNode: (node: ShadowNodeRef) => ShadowNodeRef;
  cloneNodeWithNewChildren: (node: ShadowNodeRef) => ShadowNodeRef;
  cloneNodeWithNewProps: (node: ShadowNodeRef, newProps: unknown) => ShadowNodeRef;
  cloneNodeWithNewChildrenAndProps: (node: ShadowNodeRef, newProps: unknown) => ShadowNodeRef;
  createChildSet: (surfaceId: number) => ChildSetRef;
  appendChild: (parent: ShadowNodeRef, child: ShadowNodeRef) => void;
  appendChildToSet: (childSet: ChildSetRef, child: ShadowNodeRef) => void;
  completeRoot: (surfaceId: number, childSet: ChildSetRef) => void;
  registerEventHandler: (callback: unknown) => void;
  measure: (...args: unknown[]) => void;
  measureInWindow: (...args: unknown[]) => void;
  measureLayout: (...args: unknown[]) => void;
  findNodeAtPoint: (...args: unknown[]) => void;
  setIsJSResponder: (node: ShadowNodeRef, blockNativeResponder: boolean, isJSResponder: boolean) => void;
  dispatchCommand: (node: ShadowNodeRef, command: string, args: unknown[]) => void;
  sendAccessibilityEvent: (node: ShadowNodeRef, eventType: string) => void;
  unstable_DiscreteEventPriority: number;
  unstable_ContinuousEventPriority: number;
  unstable_IdleEventPriority: number;
  unstable_getCurrentEventPriority: () => number;
}

export interface Capture {
  instructions: MountInstruction[];
  manager: NativeFabricUIManagerStub;
  reset(): void;
}

// Implements the nativeFabricUIManager JSI binding surface with a pure-JS
// recorder. Every call appends to `instructions`. Clones produce fresh nodes
// with a monotonically increasing id so the JSON stream is traceable.
export function createCapture(): Capture {
  const instructions: MountInstruction[] = [];
  let nextNodeId = 1;
  let nextChildSetId = 1;

  const manager: NativeFabricUIManagerStub = {
    createNode(tag, viewName, surfaceId, props) {
      const id = nextNodeId++;
      instructions.push({ op: "createNode", nodeId: id, tag, viewName, surfaceId, props });
      return { __node: true, id, tag, viewName, surfaceId };
    },
    cloneNode(node) {
      const id = nextNodeId++;
      instructions.push({ op: "cloneNode", nodeId: id, sourceNodeId: node.id });
      return { ...node, id };
    },
    cloneNodeWithNewChildren(node) {
      const id = nextNodeId++;
      instructions.push({ op: "cloneNodeWithNewChildren", nodeId: id, sourceNodeId: node.id });
      return { ...node, id };
    },
    cloneNodeWithNewProps(node, newProps) {
      const id = nextNodeId++;
      instructions.push({ op: "cloneNodeWithNewProps", nodeId: id, sourceNodeId: node.id, newProps });
      return { ...node, id };
    },
    cloneNodeWithNewChildrenAndProps(node, newProps) {
      const id = nextNodeId++;
      instructions.push({ op: "cloneNodeWithNewChildrenAndProps", nodeId: id, sourceNodeId: node.id, newProps });
      return { ...node, id };
    },
    createChildSet(surfaceId) {
      const id = nextChildSetId++;
      instructions.push({ op: "createChildSet", childSetId: id, surfaceId });
      return { __childSet: true, id, surfaceId };
    },
    appendChild(parent, child) {
      instructions.push({ op: "appendChild", parentNodeId: parent.id, childNodeId: child.id });
    },
    appendChildToSet(childSet, child) {
      instructions.push({ op: "appendChildToSet", childSetId: childSet.id, childNodeId: child.id });
    },
    completeRoot(surfaceId, childSet) {
      instructions.push({ op: "completeRoot", surfaceId, childSetId: childSet.id });
    },
    registerEventHandler() {
      instructions.push({ op: "registerEventHandler" });
    },
    measure() {
      // Real Fabric synchronously returns layout metrics here, populated by the
      // C++ shadow tree. We don't run layout in Node so measurements are absent.
    },
    measureInWindow() {},
    measureLayout() {},
    findNodeAtPoint() {},
    setIsJSResponder(node, blockNativeResponder, isJSResponder) {
      instructions.push({ op: "setIsJSResponder", nodeId: node.id, blockNativeResponder, isJSResponder });
    },
    dispatchCommand(node, command, args) {
      instructions.push({ op: "dispatchCommand", nodeId: node.id, command, args });
    },
    sendAccessibilityEvent(node, eventType) {
      instructions.push({ op: "sendAccessibilityEvent", nodeId: node.id, eventType });
    },
    unstable_DiscreteEventPriority: 1,
    unstable_ContinuousEventPriority: 2,
    unstable_IdleEventPriority: 3,
    unstable_getCurrentEventPriority: () => 2,
  };

  return {
    instructions,
    manager,
    reset() {
      instructions.length = 0;
      nextNodeId = 1;
      nextChildSetId = 1;
    },
  };
}
