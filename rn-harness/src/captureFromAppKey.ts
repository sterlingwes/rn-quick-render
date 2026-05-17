// AppRegistry-driven entry: take an appKey + initialProps, return the
// React element that ReactRootView would mount on a real device. The
// fixture flow becomes:
//
//   // fixtures/realRnRegisteredApp.ts
//   import { loadRealRn } from "../src/loadRealRn";
//   import { captureFromAppKey } from "../src/captureFromAppKey";
//
//   // -- App's index.js equivalent (would normally be the target
//   --    repo's entry). registerComponent stashes the provider.
//   const { RN } = loadRealRn();
//   const { View, Text, AppRegistry } = RN;
//   function MyApp({ greeting }) { return <View><Text>{greeting}</Text></View>; }
//   AppRegistry.registerComponent("MyApp", () => MyApp);
//
//   export default captureFromAppKey("MyApp", { greeting: "Hi" });
//
// On a real device, AppRegistry.runApplication wraps the registered
// root in `<AppContainer rootTag fabric initialProps>`, which adds a
// flex:1 root View + the RootTagContext provider. We replicate the
// same wrap so the captured tree matches what a device would mount
// (down to the outer View).
//
// AppRegistry only exposes the *runner* (registerComponent's
// runnables[] entry calls renderApplication directly, not the raw
// componentProvider). To recover the provider, this module installs
// a thin proxy on AppRegistry.registerComponent — invoke
// `installCaptureHook(AppRegistry)` once after loadRealRn so any
// later registerComponent calls are intercepted.

import * as React from "react";

type ComponentProvider = () => React.ComponentType<any>;

const registered: Record<string, ComponentProvider> = {};
let nextRootTag = 11;

interface AppRegistryShape {
  registerComponent: (
    appKey: string,
    provider: ComponentProvider,
    section?: boolean,
  ) => string;
  __captureHooked?: boolean;
}

/**
 * Patch AppRegistry.registerComponent to stash the original
 * componentProvider in our local map so captureFromAppKey can find
 * it. Idempotent. Called automatically by `loadRealRn()` so most
 * fixtures don't need to invoke it directly.
 */
export function installCaptureHook(AppRegistry: AppRegistryShape): void {
  if (AppRegistry.__captureHooked) return;
  AppRegistry.__captureHooked = true;
  const original = AppRegistry.registerComponent;
  AppRegistry.registerComponent = function patchedRegisterComponent(
    appKey,
    provider,
    section,
  ) {
    registered[appKey] = provider;
    return original.call(AppRegistry, appKey, provider, section);
  };
}

/**
 * Build the React element a real RN device would mount for the given
 * AppRegistry key — `<AppContainer><RootComponent {...initialProps}/></AppContainer>`.
 * Call after the fixture's `AppRegistry.registerComponent("AppKey", ...)`
 * has run.
 *
 * Throws if no component has been registered for [appKey] — usually
 * means the fixture's import order ran captureFromAppKey before the
 * app's entry module had a chance to register.
 */
export function captureFromAppKey<P extends object>(
  appKey: string,
  initialProps?: P,
): React.ReactElement {
  const provider = registered[appKey];
  if (!provider) {
    const known = Object.keys(registered);
    throw new Error(
      `captureFromAppKey: no component registered for "${appKey}". ` +
        `Make sure to import the app's entry (which calls ` +
        `AppRegistry.registerComponent) before calling. ` +
        `Currently registered: ${JSON.stringify(known)}`,
    );
  }
  const RootComponent = provider();
  // require *here* (lazy) so AppContainer isn't pulled in until the
  // first capture — the module touches StyleSheet which drags more
  // RN graph along than necessary for the loadFabric-only path.
  //
  // We go directly to AppContainer-prod rather than the dispatcher
  // (which picks the -dev variant when __DEV__ is true): the dev
  // wrapper drags in DebuggingOverlay + a window-touching registry
  // we have no use for in a headless capture, and the -prod variant
  // is what matters for the resulting view tree shape (flex:1 root
  // View + RootTagContext provider, identical structurally).
  const AppContainer =
    require("react-native/Libraries/ReactNative/AppContainer-prod").default;
  const rootTag = nextRootTag++;
  const props = initialProps ?? (Object.freeze({}) as P);
  return React.createElement(
    AppContainer,
    {
      rootTag,
      fabric: true,
      initialProps: props,
      // WrapperComponent / rootViewStyle stay null for v0 — apps that
      // need a global wrapper register one via setWrapperComponentProvider
      // before this call.
      WrapperComponent: null,
      rootViewStyle: null,
      internal_excludeLogBox: true,
    },
    React.createElement(RootComponent, { ...(props as object), rootTag }),
  );
}
