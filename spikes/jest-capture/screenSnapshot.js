// Spike prototype of the `rn-quick-render/jest` capture API.
//
// Called from inside a consumer app's ordinary Jest test, it re-renders
// the given element through ReactFabric (in the same Jest module
// environment, so every jest.mock() the test applied also applies here),
// records the nativeFabricUIManager mount-instruction stream, and writes
// it to __screensnaps__/ in exactly the JSON shape the JVM renderer
// consumes. Rendering to PNG is deliberately NOT done here — a separate
// step (CLI --batch over the emitted manifest) picks the artifacts up,
// which lets CI filter which components actually get rendered.
//
// Everything here intentionally leans on the consumer's own environment:
// no moduleNameMapper entries, no custom resolver, no harness transform
// chain. Whatever this file has to stub beyond `preset: "react-native"`
// is the true integration surface — see FINDINGS.md.

const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "__screensnaps__");

let capture = null;
let ReactFabric = null;
let nextSurfaceId = 1001;

function installCaptureGlobals() {
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
      instructions.push(
        surfaceId === undefined
          ? { op: "createChildSet", childSetId: id }
          : { op: "createChildSet", childSetId: id, surfaceId },
      );
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
    measure() {},
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

function ensureFabric() {
  if (ReactFabric) return;

  capture = installCaptureGlobals();
  globalThis.nativeFabricUIManager = capture.manager;
  if (globalThis.RN$Bridgeless === undefined) globalThis.RN$Bridgeless = true;
  if (globalThis.IS_REACT_ACT_ENVIRONMENT === undefined) {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  }
  if (globalThis.RN$registerCallableModule === undefined) {
    globalThis.RN$registerCallableModule = () => {};
  }
  if (globalThis.__nativeComponentRegistry__hasComponent === undefined) {
    globalThis.__nativeComponentRegistry__hasComponent = () => false;
  }

  // FINDING: the one module the stock preset leaves broken for Fabric.
  // RN's DOM-node layer (root creation goes through ReactNativeDocument)
  // calls the `NativeDOMCxx` TurboModule, which resolves to null under
  // the Jest preset. The packaged integration would ship this mock in a
  // setupFiles entry; capture never uses DOM APIs, so no-ops suffice.
  jest.doMock("react-native/src/private/webapis/dom/nodes/specs/NativeDOM", () => ({
    __esModule: true,
    default: {
      linkRootNode: (rootTag, _instanceHandle) => ({ __nativeDomRootShadowNode: rootTag }),
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
      setPointerCapture: () => {},
      releasePointerCapture: () => {},
      measure: () => {},
      measureInWindow: () => {},
      measureLayout: () => {},
      setNativeProps: () => {},
    },
  }));

  // FINDING: the preset mocks core components (View, Text, Image,
  // ScrollView, …) with classes that render *plain host elements named
  // after the component* ('View', not 'RCTView') — fine for
  // react-test-renderer, but Fabric demands a registered view config
  // per host name. Register permissive configs that translate each
  // mocked name back to the RCT class name the renderer understands.
  // uiViewClassName is what lands in createNode, so the emitted stream
  // is indistinguishable from a real-RN capture at the node level.
  const registry = require("react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry");
  const PRESET_MOCK_HOST_NAMES = {
    View: "RCTView",
    Image: "RCTImageView",
    Text: "RCTText",
    ScrollView: "RCTScrollView",
    TextInput: "RCTTextInput",
    Modal: "RCTView",
    ActivityIndicator: "RCTView",
  };
  // Pass every prop through except React-side concepts, mirroring the
  // harness's permissive capture (the renderer's StyleFlattener handles
  // raw style arrays; unknown props are tolerated).
  const permissiveAttributes = new Proxy(
    {},
    { get: (_t, key) => (key === "children" || key === "ref" || key === "key" ? undefined : true) },
  );
  for (const [hostName, rctName] of Object.entries(PRESET_MOCK_HOST_NAMES)) {
    try {
      registry.register(hostName, () => ({
        uiViewClassName: rctName,
        validAttributes: permissiveAttributes,
        bubblingEventTypes: {},
        directEventTypes: {},
      }));
    } catch (e) {
      // Already registered (e.g. two screenSnapshot modules in one file) — fine.
    }
  }

  // The moment of truth: require ReactFabric-dev through the consumer's
  // stock Jest environment — real ReactNativePrivateInterface, real
  // ReactNativePrivateInitializeCore, RN's own jest preset mocks.
  ReactFabric = require("react-native/Libraries/Renderer/implementations/ReactFabric-dev");
}

function assertRenderableStream(name, instructions) {
  const hostCreates = instructions.filter((i) => i.op === "createNode");
  if (hostCreates.length === 0) {
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

/**
 * Capture `element` through Fabric and write a renderable artifact.
 *
 * opts.name          artifact name (required)
 * opts.devices       device profiles the render step should fan out to
 * opts.fontScales    font-scale buckets, ditto
 */
function screenSnapshot(element, opts) {
  if (!opts || !opts.name) throw new Error("screenSnapshot requires opts.name");
  ensureFabric();

  const surfaceId = nextSurfaceId++;
  capture.reset();
  // FINDING (open question): Fabric's text-nesting DEV check keys on
  // literal host names (RCTText & co). The preset's Text mock emits a
  // host element literally named 'Text', so every raw string inside it
  // triggers "Text strings must be rendered within a <Text> component"
  // even though the capture is correct (RCTRawText lands under RCTText
  // via our view-config translation). Scope-filter that one message so
  // consumers running with strict console settings don't fail.
  const realConsoleError = console.error;
  console.error = (...args) => {
    if (typeof args[0] === "string" && args[0].includes("Text strings must be rendered within")) {
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
  const instructions = capture.instructions.slice();
  ReactFabric.stopSurface(surfaceId);

  assertRenderableStream(opts.name, instructions);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const artifactPath = path.join(OUT_DIR, `${opts.name}.json`);
  fs.writeFileSync(
    artifactPath,
    JSON.stringify(
      { fixture: opts.name, surfaceId, instructionCount: instructions.length, instructions },
      null,
      2,
    ),
  );

  // One manifest line per snapshot (JSONL so parallel workers can each
  // append to their own file without coordination; the render step
  // globs them). This is what a CI pipeline filters on.
  const workerId = process.env.JEST_WORKER_ID || "0";
  const manifestPath = path.join(OUT_DIR, `manifest-w${workerId}.jsonl`);
  fs.appendFileSync(
    manifestPath,
    JSON.stringify({
      name: opts.name,
      input: path.relative(__dirname, artifactPath),
      testPath: expect.getState().testPath ? path.relative(__dirname, expect.getState().testPath) : undefined,
      devices: opts.devices || ["pixel5"],
      fontScales: opts.fontScales || ["default"],
    }) + "\n",
  );

  return { artifactPath, instructions };
}

module.exports = { screenSnapshot };
