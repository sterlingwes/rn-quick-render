// Permissive module mock for arbitrary unresolved third-party packages,
// enabled by the opt-in RN_HARNESS_AUTOMOCK_UNRESOLVED catch-all (see
// registry.js). One module object serves all three consumption shapes:
//
//   import Foo from "pkg"          → default export
//   import { Bar } from "pkg"      → any named export
//   <Foo /> / <Bar />              → a real placeholder <View>
//
// The subtlety this file exists to solve: a bare deep-no-op proxy used as
// a JSX element type renders NOTHING (its call returns undefined), and a
// string type would emit a bogus host `viewName` that the Android/iOS
// renderers don't know and would choke on. So a component export must be
// a genuine React function component whose body returns React.createElement
// (View, …) — that puts React on its normal function-component path and
// the placeholder lands in the mount stream as an ordinary RCTView.
//
// Discrimination heuristic: a Capitalized property is treated as a
// component (Animated.View, Svg.Path); a lowercase one as a hook/utility
// (useSharedValue, enableScreens) and resolves to a deep no-op. This is
// best-effort for the long tail — known packages get faithful curated
// mocks instead.

import * as React from "react";
import { View, type ViewStyle } from "react-native";
import { deepNoopProxy } from "../nativeModuleStubs";

// React reads these off a component type during reconciliation; handing
// back a proxy for them confuses class-vs-function detection and
// defaultProps merging. Returning the bare function's own value keeps
// them inert (prototype object w/o isReactComponent → function component;
// $$typeof / defaultProps / then → undefined).
const REACT_TYPE_PROPS = new Set([
  "prototype",
  "$$typeof",
  "defaultProps",
  "propTypes",
  "contextType",
  "contextTypes",
  "childContextTypes",
  "getDefaultProps",
  // React probes these statics on a component type and warns if a
  // function component carries them — keep them undefined.
  "getDerivedStateFromProps",
  "getDerivedStateFromError",
  "type",
  "render",
  "compare",
  "then",
]);

function isComponentName(key: string): boolean {
  const c = key.charCodeAt(0);
  return c >= 65 && c <= 90; // A–Z
}

// Memoise so repeated access to the same label yields a stable component
// identity (React would otherwise remount across reads of the same import
// binding).
const cache = new Map<string, any>();

function placeholderComponent(label: string): any {
  const hit = cache.get(label);
  if (hit) return hit;

  function Placeholder(props: any) {
    return React.createElement(
      View,
      { accessibilityLabel: `<mock:${label}>`, style: props?.style as ViewStyle },
      props?.children,
    );
  }
  Placeholder.displayName = label;

  const proxy: any = new Proxy(Placeholder, {
    get(target, key) {
      if (typeof key === "symbol") {
        if (key === Symbol.toPrimitive) return () => `[${label}]`;
        return undefined;
      }
      const name = String(key);
      if (name === "displayName" || name === "name") return label;
      if (name === "__esModule") return true;
      if (REACT_TYPE_PROPS.has(name)) return (target as any)[name];
      if (isComponentName(name)) return placeholderComponent(`${label}.${name}`);
      return deepNoopProxy(`${label}.${name}`);
    },
  });

  cache.set(label, proxy);
  return proxy;
}

// The module object itself: default + any-named access, __esModule true
// so Babel/TS interop unwraps `.default` correctly for `import X from`.
const moduleProxy: any = new Proxy(function CatchAllModule() {}, {
  get(_target, key) {
    if (typeof key === "symbol") return undefined;
    const name = String(key);
    if (name === "__esModule") return true;
    if (name === "default") return placeholderComponent("default");
    if (isComponentName(name)) return placeholderComponent(name);
    return deepNoopProxy(name);
  },
});

export = moduleProxy;
