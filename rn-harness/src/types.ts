// Shape of a single captured call to the stubbed `global.nativeFabricUIManager`.
// Each fixture run produces an ordered array of these — the "mount instruction
// stream" that would cross the JS→native boundary in a real Fabric device.
export type MountInstruction =
  | { op: "createNode"; nodeId: number; tag: number; viewName: string; surfaceId: number; props: unknown }
  | { op: "cloneNode"; nodeId: number; sourceNodeId: number }
  | { op: "cloneNodeWithNewChildren"; nodeId: number; sourceNodeId: number }
  | { op: "cloneNodeWithNewProps"; nodeId: number; sourceNodeId: number; newProps: unknown }
  | { op: "cloneNodeWithNewChildrenAndProps"; nodeId: number; sourceNodeId: number; newProps: unknown }
  | { op: "createChildSet"; childSetId: number; surfaceId?: number }
  | { op: "appendChild"; parentNodeId: number; childNodeId: number }
  | { op: "appendChildToSet"; childSetId: number; childNodeId: number }
  | { op: "completeRoot"; surfaceId: number; childSetId: number }
  | { op: "registerEventHandler" }
  | { op: "setIsJSResponder"; nodeId: number; blockNativeResponder: boolean; isJSResponder: boolean }
  | { op: "dispatchCommand"; nodeId: number; command: string; args: unknown[] }
  | { op: "sendAccessibilityEvent"; nodeId: number; eventType: string };

export interface CaptureSession {
  fixture: string;
  surfaceId: number;
  instructions: MountInstruction[];
}
