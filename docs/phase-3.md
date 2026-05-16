# Phase 3 — render one screen of a real RN app

Phase 2 + 2.5 prove the renderer can paint hand-written fixtures that
import `RCTView` / `RCTImageView` / `RCTParagraph` directly. The fixture
DSL bypasses everything between an app developer's source code and the
mount-instruction stream — `react-native` itself, Metro, the asset
pipeline, native modules, navigation, third-party packages.

Phase 3's exit criterion is a single, specific milestone:

> Take an unmodified screen from a real React Native repo on GitHub
> (chosen by us, narrow surface), point the harness at it, and produce
> a PNG that matches a hand-eyeballed reference from a real device or
> emulator run of the same screen.

Hitting that exposes everything Phase 2.5's fixture DSL hides. This
doc scopes the work into chunks small enough to land independently and
defers the rest to Phase 4+.

## What the harness currently can't do

The hand-written fixtures look like this:

```ts
React.createElement(RCTView, { style: { padding: 16 } },
  React.createElement(RCTParagraph, { ... }, "hello"))
```

A real app's source looks like this:

```tsx
import { View, Text, Image, AppRegistry } from "react-native";
import { useSelector } from "react-redux";
import { useNavigation } from "@react-navigation/native";

function InboxScreen() {
  const count = useSelector(s => s.inbox.unread);
  return (
    <View style={styles.container}>
      <Image source={require("./assets/inbox.png")} style={styles.icon} />
      <Text style={styles.label}>Inbox</Text>
      <Text style={styles.count}>{count}</Text>
    </View>
  );
}

AppRegistry.registerComponent("InboxScreen", () => InboxScreen);
```

Concretely, what's in the way:

1. **`react-native` itself.** Today the harness stubs out
   `ReactNativePrivateInterface` and `ReactNativePrivateInitializeCore`
   (the two modules `ReactFabric-dev` needs at load time) but never
   actually requires `react-native`'s public exports. A real screen
   does `import { View } from "react-native"` — which lazily loads
   ~200 RN modules, most of which want a JSI / native bridge that
   doesn't exist in our Node process.
2. **Native modules.** Anything reachable from `NativeModules.X` or
   `TurboModuleRegistry.getEnforcing(...)` blows up on access. The
   list isn't small — `PlatformConstants`, `DeviceInfo`,
   `StatusBarManager`, `AsyncLocalStorage`, …
3. **Third-party packages with native sides.** `react-native-screens`,
   `react-native-reanimated`, `react-native-gesture-handler`,
   `react-native-svg`, `@react-native-async-storage/async-storage`,
   `@react-native-community/netinfo`. Each registers TurboModules
   and/or custom view managers. Without their native pair they throw
   at import time.
4. **The Metro asset pipeline.** `require('./inbox.png')` doesn't
   return a file path — Metro lowers it to a synthetic source object
   keyed in `AssetRegistry`, which the JS side then passes to `<Image
   source={…}>`. The renderer's image decoder doesn't understand that
   shape and the harness's `require` doesn't run Metro's transform.
5. **App font registration.** `FontRegistry` (Phase 2.5 §7) is the
   renderer-side hook for `<Text style={{fontFamily: 'Inter'}}>`; what
   Phase 3 still has to do is wire the app's
   `android/app/src/main/assets/fonts/` directory + any
   `react-native.config.js` family aliasing into a registry the test
   harness can build automatically, instead of asking each fixture to
   list the fonts by hand.
6. **`AppRegistry` entry points.** Apps register a component name and
   the host (Android `ReactRootView` / iOS `RCTRootView`) constructs
   the surface from it. The harness's `renderFixture` skips
   AppRegistry entirely and hands a React element directly to
   `ReactFabric.render`.

## Scope decisions

### In scope

- A way to render `<View>` / `<Text>` / `<Image>` / `<ScrollView>`
  imported from `react-native` directly, not via the fixture DSL.
  These five (plus `Pressable`'s view fallback) cover the structural
  90 % of any real screen.
- An auto-stub layer for `NativeModules` + `TurboModuleRegistry` —
  default to a no-op proxy; allow per-test overrides for the few
  modules a screen actually reads from (e.g. `PlatformConstants`).
- Metro asset resolution at capture time. The harness's Node-side
  `require` interceptor translates `require('./inbox.png')` to a
  `file://` URI with width/height/scale, so the renderer keeps the
  same `source.uri` contract it already supports.
- Wire the target app's `assets/fonts/` directory + any
  `react-native.config.js` family aliasing into a `FontRegistry`
  automatically (the renderer-side primitive landed in Phase 2.5 §7).
- An `AppRegistry`-driven entry point: `captureFromAppKey(appKey,
  appProps)` that mirrors what `ReactRootView` does on Android.
- A vetted "Phase 3 first target" repo and a single screen from it,
  with a checked-in reference render and a diff threshold.

### Out of scope (Phase 4+)

- Reanimated worklets, JSI animations, native-driven animations. They
  read fresh values from the UI thread; capture is a single-frame
  snapshot. A v0 stub returns the initial values and doesn't animate.
- Gesture handler. Capture happens before any touch event, so the
  rendered output is the resting state — gesture handler can be no-op'd.
- Custom native view components (`react-native-svg`, `react-native-maps`).
  Their view managers register host types we have no renderer for.
  Render them as a labeled placeholder rect for now.
- Concurrent root with Suspense / transitions. Phase 1 stream still
  assumes synchronous commits. A separate fixture before this can
  prove the translator handles the multi-`completeRoot` case; not
  blocking for v0.
- HTTP image sources. Snapshot tests should pin assets locally.

## What the developer brings

Our scope is the runtime plumbing: boot `react-native`, intercept the
mount stream, paint it. Everything *above* the component being rendered
— the data it consumes, the state it expects to find, the side-effect
modules it pokes at — is the developer's responsibility, the same way
Storybook stories or component snapshot tests work today.

In practice this means a Phase 3 capture isn't `captureFromAppKey('App')`
on a freshly-launched binary. It's a thin per-test wrapper that the
developer writes around the target component, supplying:

- **Props.** Pass concrete values for everything the component reads.
  No "let it render whatever the production default is."
- **Context providers.** Wrap the target in mocked
  `NavigationContainer`, `Provider` (Redux), `QueryClientProvider`,
  theming providers, etc., with fixture data. If the component uses
  hooks like `useNavigation` or `useSelector`, the provider has to
  supply something usable — we don't synthesize navigation state.
- **Network and storage.** Mock the HTTP / GraphQL client with the
  response shape the component expects. The native-module proxy shim
  no-ops `AsyncStorage` and friends by default; if the component reads
  from them, the developer overrides with seed values via
  `captureFromAppKey('...', { nativeModules: { ... } })`.
- **Animated values.** Reanimated / Animated values resolve to their
  initial value in our shim. If a component is interesting *only* at
  some animated mid-state, the developer hoists that to a prop and
  passes the target value directly.
- **Children whose rendering we don't support.** If a screen embeds
  `<MapView>` or a charting library, the developer either swaps it out
  in the test wrapper for a placeholder, or accepts the labeled-rect
  fallback the renderer paints.

Concretely, a fixture looks more like:

```ts
// fixtures/realApp/inboxScreen.ts
import InboxScreen from "<target>/src/screens/InboxScreen";
import { withMockProviders } from "./_providers";

export default withMockProviders(
  <InboxScreen
    route={{ params: { folderId: "inbox" } }}
    navigation={mockNav}
  />,
  {
    redux: { inbox: { unread: 3, items: SAMPLE_ITEMS } },
    query: { "/inbox": SAMPLE_INBOX_RESPONSE },
  },
);
```

…than `import App from '<target>'; captureFromAppKey('App')`.

The first-target screen is chosen with this in mind: it should be a
component whose props + provider mocks fit in one fixture file the
reviewer can read end-to-end. Screens that demand a real backend, a
real navigation graph, or a real animation timeline are deferred.

This boundary is what stops Phase 3 from sliding into "reimplement
half of React Native and the developer's app on top of it." We render
what the developer hands us; we don't guess what the developer would
have wanted.

## Architecture sketch

### `rn-harness` changes

```
rn-harness/src/
  loadFabric.ts              # exists — stubs the two private RN modules
  privateInterfaceStub.ts    # exists — narrow ReactNativePrivateInterface
  captureStub.ts             # exists — records mount instructions
  renderFixture.ts           # exists — renders DSL-built React elements

  nativeModuleStubs.ts       # NEW — default no-op Proxy for NativeModules
                             #       + TurboModuleRegistry; opt-in overrides
                             #       per fixture
  assetRegistry.ts           # NEW — capture-time hook into AssetRegistry so
                             #       require('./img.png') resolves to file://
                             #       URIs pointing at the on-disk asset
  loadRealRn.ts              # NEW — extends loadFabric to also install the
                             #       native-module and asset stubs, then
                             #       expose `require('react-native')` as the
                             #       app would see it
  captureFromAppKey.ts       # NEW — given an AppRegistry key, build the
                             #       same React element ReactRootView would
                             #       mount and hand it to renderFixture
```

### Renderer changes

- **`tintColor` on Image (Phase 2.5 §3 polish).** Set
  `ImageView.imageTintList = ColorStateList.valueOf(color)` when
  present.
- **Placeholder host types.** `FabricViewBuilder.buildView`'s `else`
  branch currently falls back to `buildFrameLayout`, which is fine for
  unrecognised wrappers. For unknown leaf types (e.g. `RNSVGSvgView`)
  paint a labelled rect with the view name so missing renderer coverage
  is visible, not silent.

### Native module shim design

The shim has three layers:

1. **Default proxy** — `NativeModules` is a `Proxy` whose `get` returns
   a second `Proxy` for each module, whose `get` returns a no-op
   function. Accessing `NativeModules.StatusBarManager.setStyle(...)`
   returns a function that returns `undefined`. This stops 80 % of
   crashes without any per-module work.
2. **Sync return shim** — some modules' callers expect a return value
   (`PlatformConstants.getConstants()` returns an object with
   `reactNativeVersion`, `Brand`, etc.; missing fields crash RN's
   `Platform.Version`). For those, the harness ships a small static
   constants object keyed by module name and the proxy returns it
   instead of `undefined`.
3. **Per-fixture override** — `captureFromAppKey('Inbox', appProps, {
   nativeModules: { AsyncLocalStorage: { getItem: () => null } } })`
   merges over the defaults for a single capture. Encourages tests to
   declare exactly which modules a screen depends on.

Same shape for `TurboModuleRegistry.getEnforcing`. The shim treats
TurboModules and legacy NativeModules as one namespace.

### Asset registry hook

When `loadRealRn` boots, it monkey-patches RN's `AssetRegistry`:

```ts
import AssetRegistry from "react-native/Libraries/Image/AssetRegistry";

const realRegisterAsset = AssetRegistry.registerAsset;
AssetRegistry.registerAsset = (asset) => {
  const id = realRegisterAsset(asset);
  // asset.httpServerLocation is the Metro-relative path; combine with
  // the configured project root and the asset's scale to find the
  // on-disk file. Stash the resolved file:// URI keyed by id.
  capturedAssets.set(id, resolveToFileUri(asset, projectRoot));
  return id;
};
```

When the Fabric capture stub records `createNode` for `RCTImageView`,
it intercepts the `source` prop. If `source.__packager_asset` is true,
it swaps in `{ uri: capturedAssets.get(source.uri), width: source.width,
height: source.height, scale: source.scale }` — turning the synthetic
asset reference into a path the JVM renderer already knows how to
decode.

This is a capture-time translation, not a renderer-time one. Keeps the
renderer's image contract simple: it always sees `data:` or `file://`.

## First target

Pick by these heuristics:

- `package.json` has fewer than 10 React Native packages with native
  sides (small audit surface).
- One screen we can identify visually that's mostly `<View>` /
  `<Text>` / `<Image>` (no maps, no charts, no SVG icons that aren't
  PNGs).
- Apache / MIT license (no friction redistributing screenshots).
- Active enough that the `main` branch builds.

Candidates worth surveying (in rough order of complexity):

| Repo | Note |
| --- | --- |
| `expo/expo` (any of the bare templates under `templates/`) | The bare template is basically a styled Hello World; trivial structural surface but the asset / `AppRegistry` plumbing still has to work. Good day-1 target. |
| `react-native-community/cli` example apps | Hand-rolled small RN apps the CLI uses for CI. |
| `facebook/react-native` itself (`packages/rn-tester`) | A single tab from RNTester — the screens are intentionally minimal and stress one feature each. Good day-7 target once the shim handles the long tail. |
| `mattermost/mattermost-mobile` | One of the smaller production apps. A login-screen-shaped target is plausible; the dashboard pulls in too much. |
| `rainbow-me/rainbow`, `wordpress-mobile/WordPress-Android` | Day-N+ targets — heavy reliance on Reanimated / SVG / custom native views. |

The first-target choice belongs to whoever lands the PR; this doc just
constrains what "qualifies" so we don't accidentally pick a target
that requires Phase 4.

## Order of work

1. **Phase 2.5 §3 polish — `tintColor` + Metro asset shape.** Lands
   the renderer-side contract that the capture-time asset resolver
   will emit. One PR.
2. **`loadRealRn` + native-module proxy shim.** Boot
   `require('react-native')` successfully and `<View><Text>hi</Text></View>`
   render against a no-op `NativeModules`. Synthetic fixture
   (`fixtures/realRnHelloWorld.ts`) imports from `react-native`
   instead of the DSL. One PR.
3. **`AssetRegistry` hook + capture-time `require()` interceptor.**
   Fixture with `<Image source={require('./assets/quadrant.png')} />`
   produces the same PNG today's `imageResizeModes` does. One PR.
4. **`captureFromAppKey`.** AppRegistry-driven entry. One PR.
5. **First-target integration.** Pick the repo + screen, vendor the
   minimum source needed (or git-submodule it), add a capture + render
   + reference-PNG diff job to CI. One PR; this is the real exit
   criterion.

Each PR ends with a green CI run, and #5 includes a hand-eyeballed
reference render committed alongside the generated one. The diff
threshold for #5 is intentionally generous on the first pass (e.g.
≤ 5 % pixel delta) — getting a *recognisable* render of a real screen
matters more than pixel parity on the first attempt; the gap closes
in Phase 4.

## What this doc deliberately does not commit to

- Which RN version we target. Today the harness pins to whatever
  `rn-harness/package.json` has. Locking a version range for Phase 3
  belongs in the first integration PR, once we know what the target
  repo uses.
- Whether to support iOS targets. Everything here is Android-side via
  layoutlib. iOS rendering is a Phase 5 / packaging concern.
- A perf budget. Phase 4 handles the device / theme matrix and
  per-snapshot timing; on day one of Phase 3 it's fine if a capture
  takes 5 seconds.
