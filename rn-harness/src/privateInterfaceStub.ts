// Stand-in for `react-native/Libraries/ReactPrivate/ReactNativePrivateInterface`.
//
// The real module lazily requires a big chunk of the RN runtime (Platform,
// UIManager, StyleSheet, ExceptionsManager…). We only need the handful of
// functions the Fabric renderer actually calls at render time. Everything
// else is stubbed so the module graph stays shallow and Node-loadable.

type ViewConfig = {
  uiViewClassName: string;
  validAttributes: Record<string, unknown>;
};

const viewConfigs = new Map<string, ViewConfig>();

export const ReactNativeViewConfigRegistry = {
  register(name: string, callback: () => ViewConfig) {
    viewConfigs.set(name, callback());
    return name;
  },
  get(name: string): ViewConfig {
    let config = viewConfigs.get(name);
    if (!config) {
      // Auto-register a permissive config for any host type we encounter.
      // Phase 1 goal is to observe the instruction stream, not to enforce
      // prop validation, so we let everything through.
      config = { uiViewClassName: name, validAttributes: new Proxy({}, { get: () => true }) };
      viewConfigs.set(name, config);
    }
    return config;
  },
  customBubblingEventTypes: {},
  customDirectEventTypes: {},
};

// Real createAttributePayload walks validAttributes to build the wire payload.
// For capture purposes we short-circuit to a shallow clone — the capture stub
// records whatever object the renderer hands to createNode / cloneNode*.
function createAttributePayload(nextProps: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(nextProps)) {
    if (key === "children") continue;
    out[key] = nextProps[key];
  }
  return out;
}

function diffAttributePayloads(
  prevProps: Record<string, unknown>,
  nextProps: Record<string, unknown>,
): Record<string, unknown> | null {
  const diff: Record<string, unknown> = {};
  let changed = false;
  for (const key of Object.keys(nextProps)) {
    if (key === "children") continue;
    if (!Object.is(prevProps[key], nextProps[key])) {
      diff[key] = nextProps[key];
      changed = true;
    }
  }
  for (const key of Object.keys(prevProps)) {
    if (key === "children") continue;
    if (!(key in nextProps)) {
      diff[key] = null;
      changed = true;
    }
  }
  return changed ? diff : null;
}

const Platform = { OS: "android", constants: {}, select: <T,>(sel: { android?: T; default?: T }) => sel.android ?? sel.default };

const noop = () => {};
const UIManager = {
  getViewManagerConfig: () => null,
  hasViewManagerConfig: () => false,
  createView: noop,
  updateView: noop,
  manageChildren: noop,
  setChildren: noop,
  dispatchViewManagerCommand: noop,
  measure: noop,
  measureInWindow: noop,
  measureLayout: noop,
  findSubviewIn: noop,
  removeRootView: noop,
  setJSResponder: noop,
  clearJSResponder: noop,
};

const BatchedBridge = { registerCallableModule: noop, callFunctionReturnFlushedQueue: noop };
const RCTEventEmitter = { register: noop };
const ExceptionsManager = { handleException: (err: Error) => { throw err; } };
const ReactFiberErrorDialog = { showErrorDialog: () => false };
const RawEventEmitter = { emit: noop };
const CustomEvent = function CustomEventStub() {};
const TextInputState = { focusTextInput: noop, blurTextInput: noop, currentlyFocusedInput: () => null };

// Public instance helpers — returned from createPublicInstance and friends.
// The reconciler only treats these as opaque handles; the Fabric JSI would
// otherwise attach lifecycle methods (measure, focus, blur) to them.
function createPublicInstance(tag: number, viewConfig: ViewConfig, internalInstanceHandle: unknown) {
  return { _nativeTag: tag, _viewConfig: viewConfig, _internalInstanceHandle: internalInstanceHandle };
}
function createPublicTextInstance(text: string) {
  return { text };
}
function createPublicRootInstance(containerTag: number) {
  return { containerTag };
}
function getNativeTagFromPublicInstance(instance: { _nativeTag?: number } | null) {
  return instance?._nativeTag ?? null;
}
function getNodeFromPublicInstance(instance: { _node?: unknown } | null) {
  return instance?._node ?? null;
}
function getInternalInstanceHandleFromPublicInstance(instance: { _internalInstanceHandle?: unknown } | null) {
  return instance?._internalInstanceHandle ?? null;
}

const legacySendAccessibilityEvent = noop;
const deepFreezeAndThrowOnMutationInDev = <T,>(o: T) => o;
const deepDiffer = (a: unknown, b: unknown) => !Object.is(a, b);
const flattenStyle = (style: unknown) => {
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.filter(Boolean));
  }
  return style;
};

module.exports = {
  BatchedBridge,
  ExceptionsManager,
  Platform,
  RCTEventEmitter,
  ReactNativeViewConfigRegistry,
  TextInputState,
  UIManager,
  deepDiffer,
  deepFreezeAndThrowOnMutationInDev,
  flattenStyle,
  ReactFiberErrorDialog,
  legacySendAccessibilityEvent,
  RawEventEmitter,
  CustomEvent,
  createAttributePayload,
  diffAttributePayloads,
  createPublicRootInstance,
  createPublicInstance,
  createPublicTextInstance,
  getNativeTagFromPublicInstance,
  getNodeFromPublicInstance,
  getInternalInstanceHandleFromPublicInstance,
};
