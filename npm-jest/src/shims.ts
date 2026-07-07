// The two environment shims a stock `@react-native/jest-preset` app
// needs before Fabric can render for capture. Both are idempotent and
// safe to call lazily (first `screenSnapshot`) or eagerly (the
// `rn-quick-render-jest/setup` setupFiles entry) — eager is only needed
// when the app's own code touches RN's DOM APIs before the first
// capture, because `jest.doMock` can't replace an already-required
// module.
//
// Origin of each shim is documented in the capture spike:
// spikes/jest-capture/FINDINGS.md.

declare const jest: any;

const g = globalThis as any;

export function installNativeDomMock(): void {
  if (g.__rnQuickRenderNativeDomMocked) return;
  g.__rnQuickRenderNativeDomMocked = true;

  if (typeof jest === "undefined") {
    throw new Error(
      "rn-quick-render-jest must run inside a Jest test environment",
    );
  }

  // RN 0.85 routes Fabric root creation through ReactNativeDocument,
  // which calls the NativeDOMCxx TurboModule — null under the Jest
  // preset. Capture never uses DOM APIs, so no-ops suffice. The module
  // path is version-sensitive by nature; when it doesn't exist in the
  // consumer's RN version, that version doesn't take this code path
  // and the mock is simply unnecessary.
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
        linkRootNode: (rootTag: number, _instanceHandle: unknown) => ({
          __nativeDomRootShadowNode: rootTag,
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
        setPointerCapture: () => {},
        releasePointerCapture: () => {},
        measure: () => {},
        measureInWindow: () => {},
        measureLayout: () => {},
        setNativeProps: () => {},
      },
    }),
  );
}

// The preset mocks core components with classes that render host
// elements named after the component ('View', not 'RCTView'). Fabric
// requires a registered view config per host name; registering configs
// whose uiViewClassName is the RCT class name both unblocks the render
// and normalizes the emitted stream to real-RN node names.
const PRESET_MOCK_HOST_NAMES: Record<string, string> = {
  View: "RCTView",
  Image: "RCTImageView",
  Text: "RCTText",
  ScrollView: "RCTScrollView",
  TextInput: "RCTTextInput",
  Modal: "RCTView",
  ActivityIndicator: "RCTView",
  RefreshControl: "RCTView",
};

export function registerPresetViewConfigs(): void {
  if (g.__rnQuickRenderViewConfigsRegistered) return;
  g.__rnQuickRenderViewConfigsRegistered = true;

  const registry = require("react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry");
  // Pass every prop through except React-side concepts, mirroring the
  // harness's permissive capture semantics (the renderer's
  // StyleFlattener handles raw style arrays; unknown props are
  // tolerated).
  const permissiveAttributes = new Proxy(
    {},
    {
      get: (_t, key) =>
        key === "children" || key === "ref" || key === "key" ? undefined : true,
    },
  );
  const configFor = (uiViewClassName: string) => ({
    uiViewClassName,
    validAttributes: permissiveAttributes,
    bubblingEventTypes: {},
    directEventTypes: {},
  });

  for (const [hostName, rctName] of Object.entries(PRESET_MOCK_HOST_NAMES)) {
    try {
      registry.register(hostName, () => configFor(rctName));
    } catch {
      // Already registered elsewhere — theirs wins.
    }
  }

  // Some preset mocks emit host elements under their native names via
  // requireNativeComponent ('RCTScrollView', 'RCTRefreshControl', …),
  // and app/library mocks can invent arbitrary host names. Rather than
  // enumerate them, auto-register a permissive identity config for any
  // name the registry doesn't know — the same policy the in-repo
  // capture harness uses; both render engines fall back to a plain
  // view for unrecognized names. ReactFabric captures `registry.get`
  // by reference at module load, so this wrap must be installed before
  // ReactFabric-dev is required (ensureFabric guarantees that).
  const realGet = registry.get.bind(registry);
  registry.get = (name: string) => {
    try {
      return realGet(name);
    } catch {
      registry.register(name, () => configFor(name));
      return realGet(name);
    }
  };
}
