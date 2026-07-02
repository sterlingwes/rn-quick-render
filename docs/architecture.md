# Architecture

One capture front-end, two render engines.

```
React component (.tsx fixture)
        │  rn-harness: loadFabric / loadRealRn
        │             + default mock layer
        │             + multi-frame capture (renderFrames / renderConcurrent)
        ▼
Fabric mount-instruction JSON   ← the shared contract
        │
        ├──────────────► Android engine            in-process JVM
        │                npm-cli/ + renderer/       Yoga JNI + layoutlib → PNG
        │
        └──────────────► iOS engine                HTTP
                         npm-cli-ios/               POST → rn-ios-render-server → simulator → PNG
```

A Node harness (`rn-harness/`) boots React Native's Fabric renderer
outside any app and records the ordered stream of mount instructions
that would otherwise cross the JS→native boundary. That JSON stream is
the contract: a fixture authored once can be rendered by either engine,
and a mock written once serves both. This document covers the capture
front-end and the Android engine in depth; the iOS engine's only
coupling is the HTTP API described in
[`../npm-cli-ios/README.md`](../npm-cli-ios/README.md).

## Capture: Fabric in plain Node

The Fabric JS renderer talks to the C++ core through a single global
(`nativeFabricUIManager`) plus a small set of mount-instruction
functions — `createNode`, the `cloneNode*` family, `appendChild*`,
`completeRoot`, and friends. The full catalogue, cross-referenced with
RN source lines, is in
[`fabric-mount-instructions.md`](fabric-mount-instructions.md).

The harness exploits that narrow seam:

1. Install an in-memory `nativeFabricUIManager` that appends every call
   to an ordered array (`src/captureStub.ts`).
2. Replace two RN internals via `require.cache` injection (plain Node)
   or `moduleNameMapper` (Jest): `ReactNativePrivateInitializeCore` →
   no-op, `ReactNativePrivateInterface` → a narrow stub
   (`src/privateInterfaceStub.ts`).
3. Require `ReactFabric-dev.js` directly and call
   `ReactFabric.render(element, surfaceId, null, false)`.

`concurrentRoot=false` forces a synchronous commit, so each render's
instructions land deterministically before the call returns. The stream
is self-contained for structural mount — everything needed to rebuild
the view tree is in the JSON.

**Frames.** A "frame" is one Fabric commit, delimited in the stream by
a `completeRoot` op. `renderFrames([a, b])` drives sequential renders
into one surface, so frame ≥ 2 reconciles against frame 1 and emits the
`clone*` update ops. `renderConcurrent` captures Suspense-driven
commits (fallback commit, then resolved commit) under `React.act()`.

**Real-app boot.** `loadFabric` is enough for fixtures built from host
elements (`RCTView`, `RCTParagraph`, …). `loadRealRn` goes further and
boots the actual `react-native` package under Node, stubbing
`NativeModules` / `TurboModuleRegistry` behind a layered shim, hooking
the Metro asset registry so `require('./img.png')` resolves to a real
image source, and wiring `AppRegistry` so `captureFromAppKey` can mount
exactly what a device's `ReactRootView` would. The mocking layers and
the developer-side contract are documented in
[`rendering-real-apps.md`](rendering-real-apps.md).

## Render: Yoga + layoutlib on a plain JVM

The whole Android pipeline runs in a single Gradle module
(`renderer/`):

```
   mount-instruction JSON (stdin or --batch manifest)
              │
              ▼
   ┌──────────────────────────┐
   │ YogaLayoutEngine         │  Yoga 3.x via JNI, built from the yoga/
   │  + LayoutlibTextMeasurer │  submodule. Text measured with TextPaint
   └──────────────────────────┘  + StaticLayout on layoutlib's fonts.
              │
              ▼  per-node {left, top, width, height} in dp
   ┌──────────────────────────┐
   │ FabricViewBuilder        │  Instructions + rects → FrameLayout-with-
   │                          │  absolute-positioning, TextView,
   └──────────────────────────┘  ImageView, ScrollView.
              │
              ▼
   ┌──────────────────────────┐
   │ LayoutlibBootstrap       │  Bridge.init() with fonts / ICU / native
   │  + SnapshotRenderer      │  libs from layoutlib-runtime. Measure,
   │                          │  layout, draw → Bitmap → PNG.
   └──────────────────────────┘
```

### Mount-instruction → View mapping

| Fabric viewName | Yoga behaviour | Android view |
| --- | --- | --- |
| `RCTView` | Flex container | `FrameLayout` |
| `RCTScrollView` | Flex container sized to the viewport | `ScrollView` wrapping one child |
| `RCTScrollContentView` | Flex container; natural size drives scroll extent | `FrameLayout` |
| `RCTImageView` | Flex leaf with explicit width/height | `ImageView` |
| `RCTParagraph` | Flex leaf with a real text measure function | `TextView` |
| `RCTRawText` | **Skipped** — not a Yoga node; owns the string | Consumed by the parent `RCTParagraph` |

The seam between layout and painting is deliberately narrow: the view
builder never sees flexbox props. By the time it runs, Yoga has
resolved everything to absolute positions, and layoutlib is reduced to
a painter.

### Key classes

| Class | Role |
| --- | --- |
| `LayoutlibBootstrap` | `Bridge.init()` + `RenderSession`. ~4 s cold; cached per `DeviceProfile`. |
| `YogaLayoutEngine` | Parses the JSON, builds the Yoga tree, runs `calculateLayout()`. Applies `cloneNode*` update ops against the in-flight tree (props shallow-merge; last `completeRoot` wins). |
| `LayoutlibTextMeasurer` | `TextPaint` + `StaticLayout` implementation of the measure hook, so Yoga's text measurement matches what gets painted. |
| `ParagraphTextBuilder` | Walks an `RCTParagraph` subtree into a `SpannableStringBuilder` with per-run size/color/weight/style/typeface spans. Shared by the measurer and the painter so layout and draw agree. |
| `FabricViewBuilder` | Instructions + Yoga rects → Android `View` tree. Transforms, opacity, `boxShadow` (via `ShadowProxyDrawable`), image decode + `resizeMode` + `tintColor`. |
| `StyleFlattener` | Flattens RN's arbitrarily nested style arrays with last-wins and `null`-delete semantics, matching `StyleSheet.flatten`. |
| `SnapshotRenderer` | Orchestrates layout → views → `Canvas.draw()` → `BufferedImage`. Pre-fills the canvas with the window background color (white by default) — without it, transparent areas paint black. |
| `FontRegistry` / `FontScale` | Custom font loading (`--fonts DIR`) + text-scale multiplier (`--fontScale`). |
| `DeviceProfile` | Named hardware profiles (smallPhone / pixel5 / pixel7Pro / tablet) with px + dpi, chosen to bracket common RN breakpoint buckets. |
| `BatchRunner` / `BatchManifest` | `--batch` mode: N renders in one JVM with per-device bootstrap caching. |

### Design decisions

**Direct layoutlib, not Paparazzi.** Paparazzi proved layoutlib runs
headless on Linux, but it drags the Android Gradle Plugin into the
build to reuse its resource pipeline. We aren't building an Android
app — we're loading layoutlib and asking the Bridge to paint a view
tree. A direct bootstrap (~150 lines: `Bridge.init`, a framework
resource loader, stub `LayoutlibCallback`/`ResourceResolver`) trades a
one-time implementation cost for no AGP, a plain Kotlin `application`
module that builds with any JDK 17 + CMake, and direct control over the
render session.

**Yoga in the JVM, not Node.** An earlier design ran Yoga in Node
(mirroring where real Fabric runs it) and shipped rects to the JVM.
That split falls apart at text: the JVM owns the Android-faithful text
measurer, so layout either round-trips per measured node or drifts.
Keeping Yoga in-process (JNI, built from the `yoga/` submodule) lets
the real measurer plug straight into `setMeasureFunction`, and keeps
one language, one build, one test surface for what is fundamentally one
pass.

**Theme is data, not a render flag.** Dark mode changes what colors
land in props at render time, so it's captured — the harness's
`setColorScheme()` overrides RN's `useColorScheme()` hook (the same API
real apps derive theme from) and writes a `__dark`-suffixed capture.
The renderer stays theme-agnostic. Font scale, by contrast, is a
render-time multiplier, matching how the OS applies it.

**Why a JVM at all.** layoutlib is JVM bytecode built against Android's
native runtime libs. Kotlin/Wasm and Kotlin/Native would lose it
entirely; GraalVM native-image chokes on its reflection. JVM startup
(~1 s) isn't the dominant cost anyway — `Bridge.init()` (~4 s) is,
which is why the perf work goes into amortising it (`--batch` caches
bootstraps per device profile; a matrix of 4 devices × 10 fixtures pays
init 4 times, not 40).

### Fidelity boundaries

Most drawing is pixel-faithful because it *is* Android's view system.
The known divergences:

- The software canvas has no `BlurMaskFilter`, so `boxShadow` blur is
  approximated with concentric expanded rects; platform elevation
  shadows are not rendered (users should migrate to `boxShadow`).
- Animations resolve to initial values; gestures never fire. A snapshot
  is the resting state.
- Mount changes emitted from native threads (Reanimated worklets,
  gesture-driven updates) never enter the captured stream — capture
  sees only what crosses the JS→native seam.
- RTL is not yet plumbed (Yoga root hard-codes LTR).

## Repository layout

| Path | Purpose |
| --- | --- |
| `rn-harness/` | Capture front-end. Fixtures, stubs, default mocks, Jest golden tests, capture CLI. Feeds both engines. |
| `rn-harness/fixtures/` | Fixture components; `realApp/` imports from the bluesky submodule. |
| `rn-harness/out/` | Committed JSON goldens (mount-instruction streams). |
| `renderer/` | Android engine: the Kotlin JVM renderer (the only Gradle subproject). |
| `renderer/src/test/snapshots/` | Committed PNG goldens; `matrix/` holds device/font-scale/theme variants. |
| `npm-cli/` | Android engine packaging: Node launcher that execs the staged JVM runtime (`:renderer:packageForNpm`). |
| `npm-cli-ios/` | iOS engine: capture + HTTP client for `rn-ios-render-server`. |
| `yoga/` | Git submodule: facebook/yoga, built from source via CMake/JNI. |
| `third_party/bluesky-social-app/` | Git submodule: real RN app used for integration fixtures. |

## Testing model

Both stages are golden-tested, and the goldens double as the contract
between them:

- **Capture** (Jest): each fixture re-renders and deep-equals against
  its committed `rn-harness/out/*.json`; a second CI pass runs the
  capture CLI and `git diff`s the output.
- **Render** (JUnit): each fixture renders to PNG and pixel-diffs
  against `renderer/src/test/snapshots/`; `-Drenderer.record=true`
  re-records. Matrix tests parameterize device / font-scale / theme.

One gotcha worth knowing: Fabric assigns monotonically increasing
`reactTag`s per process, so fixtures must be captured in a stable order
— new fixtures are appended to the end of both `captureFixtures.ts` and
the Jest test list, or every subsequent golden shifts.
