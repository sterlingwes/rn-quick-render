# AGENTS.md — rn-quick-render

Headless React Native snapshot renderer. Captures Fabric mount instructions in Node (Phase 1), then paints them through Android's `layoutlib` to PNGs on a plain JVM (Phase 2). No emulator, no AGP, no Paparazzi.

## Essential commands

```bash
# Phase 1 — Fabric capture (Node)
npm --prefix rn-harness install
npm --prefix rn-harness test          # Jest: re-render fixtures + diff against out/*.json goldens
npm --prefix rn-harness run capture   # rewrite out/*.json from scratch

# Phase 2 — Renderer (Kotlin/JVM)
./gradlew :renderer:test              # build Yoga JNI, run golden-diff tests
./gradlew :renderer:test -Drenderer.record=true  # overwrite committed PNG goldens
./gradlew :renderer:run --args="--output /tmp/out.png" -q  # CLI: stdin JSON → PNG

# Phase 5 — npm CLI packaging
./gradlew :renderer:packageForNpm                        # stage for build host
./gradlew :renderer:packageForNpm -Ptarget=linux         # stage linux-x64 via Docker
```

### Prerequisites

- **JDK 17** (toolchain is pinned to 17)
- **CMake + C++ toolchain** on PATH (for Yoga JNI build)
- **Node 22** for Phase 1 harness
- **Git submodules** must be checked out: `git submodule update --init --recursive`
- **Docker** required only for `-Ptarget=linux` cross-build

## Architecture and data flow

```
React component (TS/JSX)
        │
        ▼  loadFabric.ts / loadRealRn.ts
Fabric JS renderer (ReactFabric-dev.js in Node)
        │
        ▼  captureStub.ts records all nativeFabricUIManager calls
rn-harness/out/<fixture>.json   ← committed golden (mount instruction stream)
        │
        ▼  stdin pipe or batch manifest
YogaLayoutEngine (Kotlin, Yoga via JNI)
   + LayoutlibTextMeasurer (TextPaint + StaticLayout)
        │
        ▼  per-node {left, top, width, height} in dp
FabricViewBuilder → Android View tree (FrameLayout + absolute positioning)
        │
        ▼  LayoutlibBootstrap (Bridge.init → RenderSession)
SnapshotRenderer → Bitmap → BufferedImage → PNG
```

Two separate processes joined by JSON: Node captures, JVM renders. The instruction stream is the contract between them.

## Repository layout

| Path | Purpose |
| --- | --- |
| `rn-harness/` | Phase 1: Node-side Fabric capture. Fixtures, stubs, Jest tests, CLI. |
| `rn-harness/fixtures/` | Hand-written React component trees. Append new fixtures here. |
| `rn-harness/fixtures/realApp/` | Fixtures that import from `third_party/bluesky-social-app`. |
| `rn-harness/out/` | Committed JSON goldens (mount instruction streams). |
| `rn-harness/src/loadFabric.ts` | Boots Fabric in Node by stubbing `nativeFabricUIManager` + two RN internals via `require.cache`. |
| `rn-harness/src/loadRealRn.ts` | Boots full `react-native` package in Node with native-module shim layer. |
| `rn-harness/src/renderFixture.ts` | `ReactFabric.render()` → capture instructions. Multi-frame via `renderFrames()`. |
| `rn-harness/src/captureFixtures.ts` | CLI that renders all fixtures and writes `out/*.json`. |
| `renderer/` | Phase 2: Kotlin JVM renderer. The only Gradle subproject (`:renderer`). |
| `renderer/src/main/kotlin/.../` | Core renderer classes (see below). |
| `renderer/src/test/snapshots/` | Committed PNG goldens. Bootstrapped from CI artifacts or `-Drenderer.record=true`. |
| `renderer/src/test/snapshots/matrix/` | Device/font-scale/theme matrix PNGs. |
| `renderer/cmake/` | CMake build for Yoga JNI (`libyoga.so` / `.dylib` / `.dll`). |
| `renderer/docker/` | Dockerfile for linux-x64 cross-build of Yoga. |
| `npm-cli/` | Phase 5: Node launcher (`bin/rn-quick-render.js`) that execs the staged JVM renderer. Per-platform payloads under `dist-mac-arm/` and `dist-linux/`, populated by `:renderer:packageForNpm`. |
| `yoga/` | Git submodule: facebook/yoga (C++ layout engine, JNI bindings). |
| `third_party/bluesky-social-app/` | Git submodule: real RN app source for Phase 3 integration fixtures. |
| `docs/` | Phase-by-phase design docs. Read these for rationale and scope decisions. |

### Key renderer classes

| Class | Role |
| --- | --- |
| `LayoutlibBootstrap` | `Bridge.init()` + `RenderSession`. Initialized from system properties set by Gradle (`layoutlib.data`, `layoutlib.resources`). |
| `YogaLayoutEngine` | Parses mount-instruction JSON, builds Yoga node tree, runs `calculateLayout()`. Pluggable `TextMeasureProvider` interface. |
| `LayoutlibTextMeasurer` | `TextPaint` + `StaticLayout` implementation of `TextMeasureProvider`. Wired into Yoga's `setMeasureFunction`. |
| `FabricViewBuilder` | Instructions + Yoga rects → Android `View` tree. Handles `RCTView`→`FrameLayout`, `RCTTextView`→`TextView`, `RCTImageView`→`ImageView`, `RCTScrollView`→`ScrollView`. |
| `SnapshotRenderer` | Orchestrates the full pipeline: layout → view tree → `Canvas.draw()` → `BufferedImage`. |
| `StyleFlattener` | Flattens RN style arrays (arbitrarily nested) to single `JsonObject`, matching `StyleSheet.flatten` semantics. |
| `BatchRunner` / `BatchManifest` | `--batch` mode: N renders in one JVM with per-device bootstrap caching. |
| `DeviceProfile` | Named hardware profiles (smallPhone, pixel5, pixel7Pro, tablet) with px + dpi. |
| `FontRegistry` / `FontScale` | Custom font loading + system text-scale multiplier. |

## Important patterns and gotchas

### Fixture ordering matters

Fixtures must appear in **the same order** in both `captureFixtures.ts` and `mount-instructions.test.ts`. Fabric assigns monotonically increasing `reactTag` IDs, so adding a fixture in the wrong position shifts all subsequent tags and breaks goldens. **Always append new fixtures at the end of both lists.**

### Golden management

- **JSON goldens** (`rn-harness/out/*.json`): Jest deep-equals fresh capture against committed. Re-capture with `npm --prefix rn-harness run capture`.
- **PNG goldens** (`renderer/src/test/snapshots/*.png`): Pixel-exact diff. Re-record with `-Drenderer.record=true`. CI uploads fresh renders as artifacts on every run (even on failure).
- CI's capture-diff step intentionally excludes `*.layout.json` files — those are derived artefacts owned by the Phase 2 workflow.

### Fabric bootstrapping in Node

The harness runs Fabric outside any RN app by:
1. Installing a fake `nativeFabricUIManager` on `globalThis` (the capture stub).
2. Replacing two RN internals via `require.cache` injection (plain Node) or `moduleNameMapper` (Jest): `ReactNativePrivateInitializeCore` → no-op, `ReactNativePrivateInterface` → `privateInterfaceStub.ts`.
3. Requiring `ReactFabric-dev.js` directly.

When adding new RN-version-specific globals, check `loadFabric.ts` first — it already stubs `RN$Bridgeless`, `RN$registerCallableModule`, `__nativeComponentRegistry__hasComponent`.

### Native module shim layer

`loadRealRn.ts` provides a 3-tier proxy for `NativeModules` / `TurboModuleRegistry`: per-fixture overrides → sync defaults → deep no-op (`Proxy` that returns `() => {}`). If a fixture reads from a native module synchronously during render, supply the data via the `nativeModules` option.

### Jest resolver

`jestRnResolver.js` handles platform-specific extensions (`.android.js`, `.native.js`) for `react-native/**` requires. Real-app fixtures also use `realAppResolver.ts` which maps `#/...` tsconfig aliases and per-module mocks.

### Babel transform chain

- `rn-harness/` own sources → `ts-jest`
- `react-native/**` sources → `babel-jest` with `@react-native/babel-preset`
- `third_party/**` sources → `babel-jest` (same preset)
- Image assets → `jestAssetTransformer.js` (produces the same source object shape as the Node-side `assetRequireHook`)

### Style flattening

RN style props can be arbitrarily nested arrays (`[{a:1}, [{b:2}, [{c:3}]]]`). `StyleFlattener` in the renderer handles this with last-wins semantics and `null`-deletes. A simpler flattener will pass the early fixtures but fail on `blueskyPasswordUpdated`.

### Yoga JNI

Built from source via CMake as a Gradle task (`cmakeBuild`). The upstream Yoga submodule's Java sources are copied into the build dir (excluding `YogaNative.java`, which is patched to use `System.loadLibrary` instead of SoLoader). The JNI lib must be on `java.library.path` — Gradle handles this for `test` and `run` tasks.

### layoutlib data paths

The renderer reads two system properties at runtime (set by Gradle):
- `layoutlib.data` — fonts, ICU, native libs extracted from `layoutlib-runtime` JAR
- `layoutlib.resources` — framework XML resources from `layoutlib-resources` JAR

If running outside Gradle (e.g. from IDE), these must be set manually or the `extractLayoutlib` task must have run.

### Window background

`SnapshotRenderer` pre-fills the canvas with white before drawing the view tree. This matches `?attr/windowBackground` behavior. Without it, transparent areas render as black pixels (bit us on the `scrollView` fixture in Phase 2.5).

### Theme variants

Dark-mode captures are handled by `setColorScheme()` in `loadRealRn.ts`, which replaces the `useColorScheme` getter on the RN module. Themed fixtures write separate goldens with a `__dark` suffix (e.g., `blueskyOnboardingInterests__dark.json`).

## CI

Two workflows, triggered by path filters:

| Workflow | Trigger paths | What it does |
| --- | --- | --- |
| `phase-1-rn-harness.yml` | `rn-harness/**`, workflow file itself | Node 22, `npm ci && jest && capture && git diff` |
| `phase-2-renderer.yml` | `renderer/**`, `yoga/**`, `rn-harness/out/**`, `gradle/**`, `build.gradle.kts`, `settings.gradle.kts`, workflow file itself | JDK 17, build Yoga JNI, `./gradlew :renderer:test`, upload PNG artifacts |

Both run on `ubuntu-latest`. Phase 2 has a `workflow_dispatch` with `record` input to auto-commit new goldens.

## Testing approach

- **Phase 1**: Jest golden-diff. Each fixture is re-rendered and deep-equal-compared against its committed JSON. A second pass runs the standalone capture CLI and `git diff`s the output.
- **Phase 2**: JUnit golden-diff. Each fixture renders to PNG, written to `build/snapshot-output/`. Pixel-exact comparison against `src/test/snapshots/`. Record mode overwrites committed goldens.
- **Matrix tests**: `DeviceMatrixSnapshotTest`, `FontScaleMatrixSnapshotTest`, `ThemeMatrixSnapshotTest` — parameterized renders across device/font-scale/theme axes, goldens under `snapshots/matrix/`.

## Dependencies

- Kotlin 2.0.21, JDK 17 toolchain
- layoutlib 14.0.11 + layoutlib-api 31.4.2 (from `com.android.tools.layoutlib`)
- kxml2 2.3.0 for framework resource parsing
- Yoga 3.x (git submodule, built from source via JNI)
- Gson for JSON parsing in the renderer
- React 19.2.5 / react-native 0.85.1 in the harness
- Node 22 for capture

## Submodules

- `yoga/` → `https://github.com/facebook/yoga.git` (layout engine)
- `third_party/bluesky-social-app/` → `https://github.com/bluesky-social/social-app` (real RN app for Phase 3 fixtures)
