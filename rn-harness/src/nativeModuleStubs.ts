// Stubs the two RN runtime registries that any non-trivial RN module
// touches at load time: `NativeModules` (legacy) and `TurboModuleRegistry`.
//
// Both registries normally resolve to bridge-backed objects supplied by
// the host (Android/iOS). In our Node harness there's no host, so we
// hand each consumer an opt-in shim:
//
//   - Whatever's been registered via `overrides` (per-fixture seed data
//     supplied to loadRealRn) wins first.
//   - Otherwise a small set of `DEFAULT_NATIVE_MODULES` covers the
//     handful of modules RN's own bootstrap reads from
//     synchronously (PlatformConstants, DeviceInfo, …).
//   - Falling through both layers returns a deep no-op proxy: every
//     property access yields another proxy, every call returns
//     undefined. Modules that defensive-call into `NativeModules.X.foo()`
//     get back undefined instead of crashing.
//
// The proxy is the developer-responsibility boundary the Phase 3 design
// doc draws (docs/phase-3.md "What the developer brings"). If a screen
// genuinely needs a module's behaviour, the test wrapper supplies it via
// the overrides map.

export function deepNoopProxy(name: string = "stub"): any {
  const fn = function stub() {};
  return new Proxy(fn, {
    get(_, key) {
      if (key === Symbol.toPrimitive) return () => `[${name}]`;
      if (key === "toString") return () => `[${name}]`;
      if (key === "valueOf") return () => `[${name}]`;
      // Return a callable proxy for any accessed property so chained
      // access (e.g. `NativeModules.Foo.bar.baz()`) stays no-op.
      if (typeof key === "symbol") return undefined;
      return deepNoopProxy(`${name}.${String(key)}`);
    },
    apply() {
      return undefined;
    },
    construct() {
      return {};
    },
    has() {
      return true;
    },
  });
}

// Defaults for modules RN's own bootstrap reads from synchronously. Keep
// this list small and obvious — anything that's screen-specific belongs
// in a per-fixture override.
const DEFAULT_NATIVE_MODULES: Record<string, unknown> = {
  PlatformConstants: {
    isTesting: true,
    reactNativeVersion: { major: 0, minor: 85, patch: 1, prerelease: null },
    Brand: "google",
    Model: "Snapshot",
    Manufacturer: "Snapshot",
    ServerHost: "",
    forceTouchAvailable: false,
    osVersion: "34",
    systemName: "Android",
    interfaceIdiom: "Snapshot",
  },
  DeviceInfo: {
    getConstants: () => ({
      Dimensions: {
        window: { width: 411, height: 891, scale: 2.625, fontScale: 1 },
        screen: { width: 411, height: 891, scale: 2.625, fontScale: 1 },
      },
    }),
  },
  // Reused under both names — RN's I18nManager looks for the latter,
  // some legacy paths the former.
  I18nManager: {
    getConstants: () => ({
      isRTL: false,
      doLeftAndRightSwapInRTL: true,
      localeIdentifier: "en_US",
    }),
    allowRTL: () => undefined,
    forceRTL: () => undefined,
    swapLeftAndRightInRTL: () => undefined,
  },
  SourceCode: { getConstants: () => ({ scriptURL: "" }) },
  // StatusBarManager / NetworkingNative / ImageLoader / etc. fall
  // through to the deep no-op proxy — adding them here only when a
  // missing-property error surfaces.
};

export interface NativeModuleOverrides {
  [moduleName: string]: unknown;
}

export function createNativeModulesProxy(overrides: NativeModuleOverrides = {}): Record<string, unknown> {
  return new Proxy(
    {},
    {
      get(_, key) {
        if (typeof key === "symbol") return undefined;
        const name = String(key);
        if (name in overrides) return overrides[name];
        if (name in DEFAULT_NATIVE_MODULES) return DEFAULT_NATIVE_MODULES[name];
        return deepNoopProxy(`NativeModules.${name}`);
      },
      has(_, key) {
        if (typeof key === "symbol") return false;
        return true;
      },
    },
  );
}

export function createTurboModuleRegistry(overrides: NativeModuleOverrides = {}) {
  function lookup(name: string): unknown {
    if (name in overrides) return overrides[name];
    if (name in DEFAULT_NATIVE_MODULES) return DEFAULT_NATIVE_MODULES[name];
    return deepNoopProxy(`TurboModule.${name}`);
  }
  return {
    // `get(name)` is allowed to return null in the real registry.
    // We always return *something* so optional-chained module access
    // doesn't trip the host into "module unavailable" code paths
    // that may have other side effects.
    get: lookup,
    getEnforcing: lookup,
  };
}

// Re-exported as the shape `react-native/Libraries/BatchedBridge/NativeModules`
// expects when stubbed via require.cache — that module exports its
// proxy as `.default`.
export function createNativeModulesModule(overrides: NativeModuleOverrides = {}) {
  return { default: createNativeModulesProxy(overrides) };
}
