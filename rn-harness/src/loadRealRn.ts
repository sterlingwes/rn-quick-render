import Module from "module";
import path from "path";
// Install the Babel require-hook for react-native/** BEFORE any
// `require("react-native...")` higher in this module — otherwise the
// chain that loads our shim modules will try to import RN sources
// directly and choke on Flow syntax.
import "./babelRegister";
import { loadFabric, type FabricRuntime } from "./loadFabric";
import {
  createNativeModulesModule,
  createTurboModuleRegistry,
  type NativeModuleOverrides,
} from "./nativeModuleStubs";

// Boots ReactFabric *plus* the real `react-native` package, stubbing the
// host-side bridge so RN's module graph can load under Node. The result
// is the same FabricRuntime shape `loadFabric` returns, with an extra
// `RN` field exposing the `react-native` module exports.
//
// Use this instead of loadFabric when the fixture imports from
// `react-native` directly:
//
//   import { View, Text } from "react-native";
//   ReactFabric.render(<View><Text>hi</Text></View>, ...)
//
// Caveats:
//   - Per the Phase 3 design doc, this only handles structural rendering.
//     Animation, gesture, navigation, and state must come from the
//     fixture's wrapper code — they don't auto-resolve.
//   - The native-module shim is deliberately permissive (deep no-op
//     proxy by default). If a screen reads from a module synchronously
//     during render and needs real data, supply it via `opts.nativeModules`.

export interface LoadRealRnOptions {
  /** Per-fixture native-module overrides; merged over the shim defaults. */
  nativeModules?: NativeModuleOverrides;
}

export interface RealRnRuntime extends FabricRuntime {
  // The `react-native` module exports — typed as `any` deliberately;
  // RN's runtime export shape is a lazy-loaded grab-bag and the
  // index.d.ts is enormous. Fixtures keep their own narrowing.
  RN: any;
}

function stubRequire(requestedId: string, replacement: unknown): void {
  const require_ = Module.createRequire(require.resolve("react-native/package.json"));
  let resolved: string;
  try {
    resolved = require_.resolve(requestedId);
  } catch {
    // Some stubs target modules that may not exist in every RN version
    // (e.g. version-gated internals). Skip silently — if the consumer
    // actually requires the missing module Node will surface a clearer
    // error than we can construct here.
    return;
  }
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

export function loadRealRn(opts: LoadRealRnOptions = {}): RealRnRuntime {
  // Bootstrap the same Fabric internals loadFabric() does — installs the
  // capture stub on `globalThis.nativeFabricUIManager`, plus the two
  // ReactPrivate replacements. Done first so the modules below find
  // already-cached versions when their own require chain reaches them.
  const fabric = loadFabric();

  // Stub the registries before requiring 'react-native' so RN's bootstrap
  // never sees the bridge-backed implementations.
  stubRequire(
    "react-native/Libraries/TurboModule/TurboModuleRegistry",
    createTurboModuleRegistry(opts.nativeModules),
  );
  stubRequire(
    "react-native/Libraries/BatchedBridge/NativeModules",
    createNativeModulesModule(opts.nativeModules),
  );

  // require('react-native') uses lazy getters per export, so this load
  // itself is cheap — the cost shifts to whichever components the fixture
  // actually touches.
  const RN = require("react-native");

  const runtime: RealRnRuntime = { ...fabric, RN };
  // Hand the runtime to renderFixture so subsequent renderFrames() calls
  // reuse this surface instead of bootstrapping a fresh loadFabric.
  (globalThis as any).__rnHarnessFabric = runtime;
  return runtime;
}
