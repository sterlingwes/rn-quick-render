import Module from "module";
import path from "path";
import { createCapture, type Capture } from "./captureStub";

// The two RN internals we must replace before Fabric-dev loads:
//
//  1. ReactNativePrivateInitializeCore — imports a tangle of platform modules
//     (Platform, InitializeCore, GlobalPerformanceLogger). Replaced with a
//     no-op so the module graph stops at the boundary.
//  2. ReactNativePrivateInterface — the narrow seam Fabric uses to reach RN.
//     Replaced with our privateInterfaceStub, which provides just the parts
//     the renderer calls (createAttributePayload, ViewConfigRegistry, etc).
//
// When running under Jest, these replacements are driven by moduleNameMapper
// in jest.config.js instead — Jest maintains its own module registry and
// ignores require.cache.
function stubRequire(requestedId: string, replacement: unknown) {
  const require_ = Module.createRequire(require.resolve("react-native/package.json"));
  const resolved = require_.resolve(requestedId);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    path: path.dirname(resolved),
    paths: [],
    children: [],
    exports: replacement,
    parent: null,
    require: require_,
    isPreloading: false,
  } as unknown as NodeJS.Module;
}

export interface FabricRuntime {
  ReactFabric: {
    render: (element: unknown, containerTag: number, callback?: (() => void) | null, concurrentRoot?: boolean, options?: unknown) => unknown;
    stopSurface: (containerTag: number) => void;
  };
  capture: Capture;
}

// Boots ReactFabric-dev. Under plain Node this installs the capture stub and
// swaps the two RN internals via require.cache. Under Jest, those swaps are
// already configured via moduleNameMapper + setupFiles, and the capture lives
// on `globalThis.__rnHarnessCapture`.
export function loadFabric(): FabricRuntime {
  const existingCapture = (globalThis as any).__rnHarnessCapture as Capture | undefined;
  const capture = existingCapture ?? createCapture();

  if (!existingCapture) {
    (globalThis as any).__DEV__ = true;
    (globalThis as any).nativeFabricUIManager = capture.manager;
    (globalThis as any).RN$Bridgeless = true;
    (globalThis as any).RN$stopSurface = undefined;

    stubRequire(
      "react-native/Libraries/ReactPrivate/ReactNativePrivateInitializeCore",
      {},
    );
    stubRequire(
      "react-native/Libraries/ReactPrivate/ReactNativePrivateInterface",
      require("./privateInterfaceStub"),
    );
  }

  const ReactFabric = require("react-native/Libraries/Renderer/implementations/ReactFabric-dev");

  return { ReactFabric, capture };
}

