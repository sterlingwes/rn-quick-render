"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  screenSnapshot: () => screenSnapshot
});
module.exports = __toCommonJS(index_exports);
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));

// ../rn-harness/src/captureStub.ts
function createCapture() {
  const instructions = [];
  let nextNodeId = 1;
  let nextChildSetId = 1;
  const manager = {
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
      const op = surfaceId === void 0 ? { op: "createChildSet", childSetId: id } : { op: "createChildSet", childSetId: id, surfaceId };
      instructions.push(op);
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
    },
    measureInWindow() {
    },
    measureLayout() {
    },
    findNodeAtPoint() {
    },
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
    unstable_getCurrentEventPriority: () => 2
  };
  return {
    instructions,
    manager,
    reset() {
      instructions.length = 0;
      nextNodeId = 1;
      nextChildSetId = 1;
    }
  };
}

// ../rn-harness/src/normalizeCapture.ts
function synthesizeScrollContentViews(instructions) {
  if (instructions.some((i) => i.op.startsWith("cloneNode"))) return instructions;
  const viewNameOf = /* @__PURE__ */ new Map();
  let maxNodeId = 0;
  let maxTag = 0;
  for (const ins of instructions) {
    if (ins.op === "createNode") {
      viewNameOf.set(ins.nodeId, ins.viewName);
      if (ins.nodeId > maxNodeId) maxNodeId = ins.nodeId;
      if (ins.tag > maxTag) maxTag = ins.tag;
    }
  }
  const childrenOf = /* @__PURE__ */ new Map();
  for (const ins of instructions) {
    if (ins.op === "appendChild") {
      const kids = childrenOf.get(ins.parentNodeId) ?? [];
      kids.push(ins.childNodeId);
      childrenOf.set(ins.parentNodeId, kids);
    }
  }
  const needsWrap = /* @__PURE__ */ new Set();
  for (const [nodeId, viewName] of viewNameOf) {
    if (viewName !== "RCTScrollView") continue;
    const kids = childrenOf.get(nodeId) ?? [];
    const alreadyCanonical = kids.length === 1 && viewNameOf.get(kids[0]) === "RCTScrollContentView";
    if (!alreadyCanonical) needsWrap.add(nodeId);
  }
  if (needsWrap.size === 0) return instructions;
  const wrapperFor = /* @__PURE__ */ new Map();
  const out = [];
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
        props: {}
      });
      out.push({ op: "appendChild", parentNodeId: ins.nodeId, childNodeId: wrapperId });
      continue;
    }
    if (ins.op === "appendChild" && wrapperFor.has(ins.parentNodeId)) {
      out.push({ ...ins, parentNodeId: wrapperFor.get(ins.parentNodeId) });
      continue;
    }
    out.push(ins);
  }
  return out;
}
function normalizeInstructions(instructions) {
  const tagMap = /* @__PURE__ */ new Map();
  const surfaceMap = /* @__PURE__ */ new Map();
  let nextTag = 2;
  let nextSurface = 1;
  const mapTag = (tag) => {
    let mapped = tagMap.get(tag);
    if (mapped === void 0) {
      mapped = nextTag;
      nextTag += 2;
      tagMap.set(tag, mapped);
    }
    return mapped;
  };
  const mapSurface = (surfaceId) => {
    let mapped = surfaceMap.get(surfaceId);
    if (mapped === void 0) {
      mapped = nextSurface;
      nextSurface += 1;
      surfaceMap.set(surfaceId, mapped);
    }
    return mapped;
  };
  return instructions.map((ins) => {
    switch (ins.op) {
      case "createNode":
        return { ...ins, tag: mapTag(ins.tag), surfaceId: mapSurface(ins.surfaceId) };
      case "createChildSet":
        return ins.surfaceId === void 0 ? ins : { ...ins, surfaceId: mapSurface(ins.surfaceId) };
      case "completeRoot":
        return { ...ins, surfaceId: mapSurface(ins.surfaceId) };
      default:
        return ins;
    }
  });
}

// src/shims.ts
var g = globalThis;
function installNativeDomMock() {
  if (g.__rnQuickRenderNativeDomMocked) return;
  g.__rnQuickRenderNativeDomMocked = true;
  if (typeof jest === "undefined") {
    throw new Error(
      "rn-quick-render-jest must run inside a Jest test environment"
    );
  }
  const nativeDomSpec = "react-native/src/private/webapis/dom/nodes/specs/NativeDOM";
  try {
    require.resolve(nativeDomSpec);
  } catch {
    return;
  }
  jest.doMock(
    nativeDomSpec,
    () => ({
      __esModule: true,
      default: {
        linkRootNode: (rootTag, _instanceHandle) => ({
          __nativeDomRootShadowNode: rootTag
        }),
        getParentNode: () => null,
        getChildNodes: () => [],
        isConnected: () => false,
        compareDocumentPosition: () => 0,
        getTextContent: () => "",
        getBoundingClientRect: () => [0, 0, 0, 0],
        getOffset: () => [null, 0, 0],
        getScrollPosition: () => [0, 0],
        getScrollSize: () => [0, 0],
        getInnerSize: () => [0, 0],
        getBorderWidth: () => [0, 0, 0, 0],
        getTagName: () => "",
        getElementById: () => null,
        hasPointerCapture: () => false,
        setPointerCapture: () => {
        },
        releasePointerCapture: () => {
        },
        measure: () => {
        },
        measureInWindow: () => {
        },
        measureLayout: () => {
        },
        setNativeProps: () => {
        }
      }
    })
  );
}
var PRESET_MOCK_HOST_NAMES = {
  View: "RCTView",
  Image: "RCTImageView",
  Text: "RCTText",
  ScrollView: "RCTScrollView",
  TextInput: "RCTTextInput",
  Modal: "RCTView",
  ActivityIndicator: "RCTView",
  RefreshControl: "RCTView"
};
function registerPresetViewConfigs() {
  if (g.__rnQuickRenderViewConfigsRegistered) return;
  g.__rnQuickRenderViewConfigsRegistered = true;
  const registry = require("react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry");
  const permissiveAttributes = new Proxy(
    {},
    {
      get: (_t, key) => key === "children" || key === "ref" || key === "key" ? void 0 : true
    }
  );
  const configFor = (uiViewClassName) => ({
    uiViewClassName,
    validAttributes: permissiveAttributes,
    bubblingEventTypes: {},
    directEventTypes: {}
  });
  for (const [hostName, rctName] of Object.entries(PRESET_MOCK_HOST_NAMES)) {
    try {
      registry.register(hostName, () => configFor(rctName));
    } catch {
    }
  }
  const realGet = registry.get.bind(registry);
  registry.get = (name) => {
    try {
      return realGet(name);
    } catch {
      registry.register(name, () => configFor(name));
      return realGet(name);
    }
  };
}

// src/index.ts
var capture = null;
var ReactFabric = null;
var nextSurfaceId = 1001;
function ensureFabric() {
  if (ReactFabric) return;
  installNativeDomMock();
  capture = createCapture();
  const g2 = globalThis;
  g2.nativeFabricUIManager = capture.manager;
  if (g2.RN$Bridgeless === void 0) g2.RN$Bridgeless = true;
  if (g2.IS_REACT_ACT_ENVIRONMENT === void 0) g2.IS_REACT_ACT_ENVIRONMENT = true;
  if (g2.RN$registerCallableModule === void 0) g2.RN$registerCallableModule = () => {
  };
  if (g2.__nativeComponentRegistry__hasComponent === void 0) {
    g2.__nativeComponentRegistry__hasComponent = () => false;
  }
  registerPresetViewConfigs();
  ReactFabric = require("react-native/Libraries/Renderer/implementations/ReactFabric-dev");
}
function assertRenderableStream(name, instructions) {
  if (!instructions.some((i) => i.op === "createNode")) {
    throw new Error(
      `screenSnapshot("${name}") captured no host components. The element likely rendered against mocked-out primitives (e.g. a wholesale jest.mock of react-native).`
    );
  }
  if (!instructions.some((i) => i.op === "completeRoot")) {
    throw new Error(`screenSnapshot("${name}") never committed \u2014 no completeRoot op captured.`);
  }
}
function withColorScheme(scheme, fn) {
  if (scheme === null) return fn();
  const RN = require("react-native");
  const original = Object.getOwnPropertyDescriptor(RN, "useColorScheme");
  Object.defineProperty(RN, "useColorScheme", {
    value: () => scheme,
    configurable: true,
    writable: true
  });
  try {
    return fn();
  } finally {
    if (original) Object.defineProperty(RN, "useColorScheme", original);
  }
}
function renderOnce(name, element) {
  ensureFabric();
  const surfaceId = nextSurfaceId++;
  capture.reset();
  const realConsoleError = console.error;
  console.error = (...args) => {
    if (typeof args[0] === "string" && args[0].includes("Text strings must be rendered within")) {
      return;
    }
    realConsoleError(...args);
  };
  try {
    ReactFabric.render(element, surfaceId, null, false);
  } finally {
    console.error = realConsoleError;
  }
  const instructions = normalizeInstructions(
    synthesizeScrollContentViews(capture.instructions.slice())
  );
  ReactFabric.stopSurface(surfaceId);
  assertRenderableStream(name, instructions);
  return instructions;
}
function resolveOutDir(opts) {
  return opts.outDir ?? process.env.RN_QUICK_RENDER_SNAPS_DIR ?? path.join(process.cwd(), "__screensnaps__");
}
function writeArtifact(outDir, fileName, instructions) {
  const surfaceId = instructions.map((i) => "surfaceId" in i ? i.surfaceId : void 0).find((s) => s !== void 0) ?? 1;
  const artifactPath = path.join(outDir, `${fileName}.json`);
  fs.writeFileSync(
    artifactPath,
    JSON.stringify(
      { fixture: fileName, surfaceId, instructionCount: instructions.length, instructions },
      null,
      2
    )
  );
  return artifactPath;
}
function appendManifestLine(outDir, entry) {
  const workerId = process.env.JEST_WORKER_ID || "0";
  fs.appendFileSync(
    path.join(outDir, `manifest-w${workerId}.jsonl`),
    JSON.stringify(entry) + "\n"
  );
}
function screenSnapshot(element, opts) {
  if (!opts || !opts.name) throw new Error("screenSnapshot requires opts.name");
  const outDir = resolveOutDir(opts);
  fs.mkdirSync(outDir, { recursive: true });
  const testPath = typeof expect !== "undefined" && expect.getState?.().testPath ? path.relative(process.cwd(), expect.getState().testPath) : void 0;
  const schemes = opts.colorSchemes?.length ? opts.colorSchemes : [null];
  const artifacts = schemes.map((scheme) => {
    const suffix = scheme === "dark" ? "__dark" : "";
    const instructions = withColorScheme(
      scheme,
      () => renderOnce(opts.name, element)
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
      ...scheme ? { colorScheme: scheme } : {}
    });
    return { scheme, artifactPath, instructions };
  });
  return {
    artifacts,
    artifactPath: artifacts[0].artifactPath,
    instructions: artifacts[0].instructions
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  screenSnapshot
});
