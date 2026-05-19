# rn-quick-render

Headless React Native snapshot rendering on Linux. Phase 1 captures
Fabric mount instructions in Node; Phase 2 paints them through Android's
`layoutlib` to PNGs on a plain JVM (no Paparazzi, no AGP, no emulator).

See [`docs/explore-plan.md`](docs/explore-plan.md) for the full
exploration plan, [`docs/phase-2-translator.md`](docs/phase-2-translator.md)
for the current renderer design,
[`docs/phase-2.5.md`](docs/phase-2.5.md) for per-item fidelity status,
[`docs/phase-3.md`](docs/phase-3.md) for what it'll take to render
a screen from a real RN app, and [`docs/phase-4.md`](docs/phase-4.md)
for the device / theme / perf matrix.

## Status at a glance

| Phase | What | Status |
| --- | --- | --- |
| 0 | Paparazzi validates layoutlib-on-Linux | ✅ done — retrospective only, module deleted |
| 1 | Fabric mount-instruction capture in Node | ✅ 18 fixtures, CI green |
| 2 | Direct layoutlib renderer (Yoga JNI + text measurer + view builder) | ✅ PNG goldens committed and diffed per CI run |
| 2.5 | Text spans, image loading, transforms, updates, fonts, RTL | 🟡 #1–#5 + #7 landed; only #6 (RTL) remains open. Latest fidelity fixes: Yoga `gap` / `rowGap` / `columnGap` plumbing, `textAlign` `TextView.gravity`, `marginLeft/Right: 'auto'`, `EXACTLY` measure-mode honor, shared `StyleFlattener` |
| 3 | Render a real RN app screen (native-module shim + asset pipeline) | ✅ all 4 steps landed — four bsky-social-app fixtures ladder from primitive (Divider) → composite card (Admonition) → small form (PasswordUpdatedForm) → screen-sized onboarding step (StepInterests). Plan: [`docs/phase-3.md`](docs/phase-3.md) |
| 4 | Device / theme matrix + perf | 🟡 step 1 landed — device matrix renders `blueskyOnboardingInterests` across 4 Android profiles (smallPhone / pixel5 / pixel7Pro / tablet) with per-config PNG goldens. Theme matrix + perf benchmark + parallelization ahead. Plan: [`docs/phase-4.md`](docs/phase-4.md) |
| 5 | Packaging (Gradle plugin + npm CLI) | ⏳ not started |

## Phase 0 — layoutlib validation (retrospective)

Phase 0 used Paparazzi to confirm that Android's view system runs headless
on a plain Linux JVM. Exit criteria were met on CI (`ubuntu-latest`, 4 vCPU /
16 GB):

| Metric | Value |
| --- | --- |
| JVM → first Paparazzi snapshot | 4.1 s |
| Per-snapshot median | 121 ms |
| Per-snapshot p95 | 158 ms |
| Paparazzi-induced RSS delta | +71 MB |

The `snapshots/` module and its Paparazzi-based tests were deleted in the
Phase 2 pivot to a direct layoutlib bootstrap (commit `437e34a`). See
[`docs/phase-2-translator.md`](docs/phase-2-translator.md) for why
Paparazzi did not survive Phase 2; git history is the system of record
for the Phase 0 implementation.

## Phase 1 — Fabric mount-instruction capture in Node

**Goal:** prove we can run React Native's Fabric JS renderer outside an app —
no Metro, no emulator, no Gradle — by hand-stubbing the single global seam
(`nativeFabricUIManager`) and recording every JS→native call it makes.

**Exit criteria:**
- Render 5 representative fixture screens (View nesting, Text, Image,
  ScrollView, conditional component boundaries) through Fabric in pure Node.
- Produce a deterministic JSON instruction stream per fixture — committed as
  goldens and diffed on every CI run.
- Document the full set of instruction types the translator has to implement.

### What's under `rn-harness/`

| Path | Purpose |
| --- | --- |
| `src/captureStub.ts` | In-memory `nativeFabricUIManager` that appends every `createNode` / clone / `appendChild*` / `completeRoot` call to an ordered array. |
| `src/privateInterfaceStub.ts` | Narrow stand-in for `ReactNativePrivateInterface` — the only RN internal the Fabric renderer calls at runtime. Covers `createAttributePayload`, `diffAttributePayloads`, `ReactNativeViewConfigRegistry`, `Platform`, and a handful of instance/handle helpers. |
| `src/loadFabric.ts` | Installs the globals and RN-internal stubs in the right order, then `require()`s `ReactFabric-dev.js`. Works under plain Node (via `require.cache`) and under Jest (via `moduleNameMapper`). |
| `src/renderFixture.ts` | `ReactFabric.render(…, concurrentRoot=false)` → copy instructions → `stopSurface`. Synchronous commit, isolated per fixture. |
| `src/captureFixtures.ts` | CLI that renders all five fixtures in a fixed order and writes `out/*.json`. |
| `fixtures/*.ts` | Hand-written React trees using RN host types (`RCTView`, `RCTRawText`, `RCTImageView`, `RCTScrollView`, `RCTParagraph`). |
| `out/*.json` | Committed goldens. |
| `test/mount-instructions.test.ts` | Jest suite that re-renders each fixture and deep-equals against its golden. |
| `docs/fabric-mount-instructions.md` | Catalogue of every call the renderer makes, cross-referenced with RN source lines. |

### Local run

```bash
npm --prefix rn-harness install
npm --prefix rn-harness test        # Jest: re-render + diff against goldens
npm --prefix rn-harness run capture # rewrite out/*.json from scratch
```

### Phase 1 findings

- The Fabric JS renderer talks to C++ through a single global
  (`nativeFabricUIManager`) plus 10 mount-instruction functions. The full
  catalogue is in [`docs/fabric-mount-instructions.md`](docs/fabric-mount-instructions.md).
- Stream is self-contained for structural mount. Two gaps: text measurement
  (requires a Yoga+Minikin measurer) and mount-changes emitted from native
  threads outside JS (Reanimated, gesture handler). Phase 2 handles the first;
  Phase 3's native-module audit handles the second.
- Five fixtures, 84 total instructions, captured in <300 ms of Node time
  (cold-includes-require). CI runs the whole loop — `npm ci && jest && capture
  && git diff --quiet out/` — in under a minute.

### Status

| Check | Where |
| --- | --- |
| Fabric-dev boots under Node 22 with only globals + two internal stubs | ✅ locally + CI |
| 5 fixture goldens render byte-identically on re-capture | ✅ `rn-harness/out/*.json` |
| Catalogue of mount-instruction types with RN source line refs | ✅ `docs/fabric-mount-instructions.md` |
| CI re-capture + golden diff | ✅ `.github/workflows/phase-1-rn-harness.yml` |

### Resolved in Phase 2

- Text measurer landed as `LayoutlibTextMeasurer` (`TextPaint` +
  `StaticLayout`) — no longer the char-width approximation that the
  Phase 2 sketch started with.

### Still open

- Add a concurrent-root fixture before Phase 3 — concurrent updates can
  fragment the stream across multiple `completeRoot` calls and the Phase 1
  stream assumes synchronous commits.

## Phase 2 — Fabric → layoutlib renderer

**Goal:** take a Phase 1 mount-instruction JSON stream and paint it through
Android's `layoutlib` to a PNG on Linux. No Paparazzi, no Android Gradle
Plugin, no emulator. See [`docs/phase-2-translator.md`](docs/phase-2-translator.md)
for the design writeup and the architectural pivot away from Paparazzi.

**Exit criteria:**
- Direct `layoutlib` bootstrap on a plain JVM — `Bridge.init()` with the
  fonts / ICU / native libs extracted from `layoutlib-runtime`. ✅
- Yoga 3.2 running in-process via JNI (built from source), with a real
  text measurer (`TextPaint` + `StaticLayout` over layoutlib's bundled
  fonts). ✅
- Kotlin translator (`FabricViewBuilder`) constructs a `FrameLayout`
  tree with absolute positioning; layoutlib is reduced to a painter. ✅
- One committed PNG golden per Phase 1 fixture, diffed on every CI run.
  ⏳ Test harness landed; PNG goldens still need to be bootstrapped from
  the first CI run (see _CI_ below).
- Text / image / transform fidelity is honestly labelled as a Phase 2.5
  backlog. ✅

### What's under `renderer/`

| Path | Purpose |
| --- | --- |
| `build.gradle.kts` | Yoga CMake build, `layoutlib-runtime` extraction, JNI lib resolution per host OS. |
| `cmake/CMakeLists.txt` | Cross-platform JNI build of `libyoga.so` / `.dylib` / `.dll`. |
| `src/main/java/com/facebook/yoga/YogaNative.java` | Patched: `System.loadLibrary` instead of SoLoader. |
| `src/main/kotlin/.../LayoutlibBootstrap.kt` | `Bridge.init()` + `RenderSession` with stub `LayoutlibCallback`/`ResourceResolver`. |
| `src/main/kotlin/.../FrameworkResourceLoader.kt` | Parses framework XML resources for the bridge's resolver (replaces `sdk-common`). |
| `src/main/kotlin/.../YogaLayoutEngine.kt` | Kotlin port of the old `computeLayout.ts` — tree reconstruction + Yoga pass. |
| `src/main/kotlin/.../LayoutlibTextMeasurer.kt` | `TextPaint` + `StaticLayout` text measurer, wired into Yoga's `setMeasureFunction`. |
| `src/main/kotlin/.../FabricViewBuilder.kt` | Mount instructions + Yoga rects → `View` tree (FrameLayout + ScrollView + TextView + ImageView). |
| `src/main/kotlin/.../SnapshotRenderer.kt` | End-to-end: JSON → layout → Views → `Bitmap` → `BufferedImage`. |
| `src/main/kotlin/.../Main.kt` | CLI: stdin JSON → PNG. |
| `src/test/kotlin/.../SnapshotRendererTest.kt` | One `@Test` per Phase 1 fixture; PNG golden-diff with optional `-Drenderer.record=true`. |
| `src/test/snapshots/*.png` | Committed PNG goldens. Bootstrapped from the `phase2-fresh-renders` CI artifact. |
| `.github/workflows/phase-2-renderer.yml` | Linux job: build Yoga JNI, run tests, upload PNG renders on every run. |

### Phase 2 findings

- Direct `Bridge.init()` is ~150 lines (bootstrap + framework resource
  loader + a handful of stubs) and removes the AGP / Paparazzi dependency
  graph entirely. The renderer module is a plain Kotlin `application`
  module — any JDK 17 + CMake builds it.
- Yoga ports cleanly between the TS and Kotlin versions of
  `computeLayout`; the JNI bindings from upstream needed only a one-line
  patch to swap `SoLoader` for `System.loadLibrary`.
- Real text measurement via `TextPaint` + `StaticLayout` slots into
  Yoga's `setMeasureFunction` without an IPC hop. The char-width
  approximation that Phase 2's first sketch carried over from Node is
  gone.
- The previous Node-side Yoga split (`computeLayout.ts`,
  `*.layout.json` goldens, `yoga-layout` npm dep) is deleted. Layout and
  rendering live in the same process, in one language.

### Local run

```bash
# Verify against committed goldens.
./gradlew :renderer:test

# Re-record committed goldens (intentional drift).
./gradlew :renderer:test -Drenderer.record=true

# One-off render via the CLI.
cat rn-harness/out/simpleView.json | \
  ./gradlew :renderer:run --args="--output /tmp/simpleView.png" -q
```

Requires JDK 17 and a C++ toolchain with CMake on `PATH`. The Yoga
submodule must be checked out (`git submodule update --init --recursive`).

### Status

| Check | Where |
| --- | --- |
| Yoga JNI builds from source on Linux + macOS | ✅ locally |
| `LayoutlibBootstrap` creates a successful `RenderSession` | ✅ unit test |
| `FabricViewBuilder` maps the 5 fixture instruction streams to View trees | ✅ unit test |
| `LayoutlibTextMeasurer` returns Roboto-shaped metrics | ✅ unit test |
| Per-fixture end-to-end PNG diff vs. committed golden | ⏳ harness landed; goldens bootstrapped from first green CI run |
| CI workflow | ✅ `.github/workflows/phase-2-renderer.yml` (uploads PNGs on every run) |

### Bootstrapping the goldens

The committed-PNG directory (`renderer/src/test/snapshots/`) starts
empty. Two ways to seed it:

1. **Manual-dispatch the workflow with `record=true`** (recommended for
   the first run). The job runs in record mode, writes the PNGs into
   `renderer/src/test/snapshots/`, commits them as
   `github-actions[bot]`, and pushes back to the dispatching branch.
   Requires the workflow to run from a branch you control. Subsequent
   runs without the `record` input default to verify mode.
2. **Download + commit by hand.** Every run uploads
   `renderer/build/snapshot-output/*.png` as the `phase2-fresh-renders`
   artifact (even on failure). Download, eyeball, drop into
   `renderer/src/test/snapshots/`, commit.

After the goldens are in place, every push/PR verifies against them. A
pixel diff fails the job and uploads the fresh renders for inspection.

### Phase 2.5 status

Per-item detail and findings live in
[`docs/phase-2.5.md`](docs/phase-2.5.md). Snapshot:

| # | Item | Status |
| --- | --- | --- |
| 1 | ScrollView row outline anomaly | ✅ resolved — canvas pre-fills with `windowBackgroundColor` |
| 2 | Nested text styling | ✅ `ParagraphTextBuilder` + `SpannableStringBuilder` per-run spans |
| 3 | Image loading | ✅ `data:` + `file://` decoding, 4 `resizeMode`s, `tintColor` via `PorterDuffColorFilter`, tolerates Metro-shaped sources (the capture-time `require()` resolver lives in Phase 3 #2) |
| 4 | Update path (`cloneNodeWithNewProps` & friends) | ✅ multi-frame fixtures + `cloneInto` in both engines |
| 5 | `transform` / `opacity` / `boxShadow` | ✅ + `ShadowProxyDrawable` for software-canvas blur approximation |
| 6 | RTL | ⏳ Yoga root still hard-coded `DIRECTION_LTR` |
| 7 | Custom font loading | ✅ `FontRegistry` + `SnapshotRenderer(fontRegistry=…)` + CLI `--fonts DIR` |
| – | Concurrent-root capture | ⏳ Phase 1 stream still assumes synchronous commits |

## Phase 3 — render one screen of a real RN app

Boot the real `react-native` package under Node and feed a fixture
that imports `<View>` / `<Text>` / `<Image>` from `react-native`
through Fabric to the same mount-instruction stream the renderer
already understands. Per-item plan and scope decisions live in
[`docs/phase-3.md`](docs/phase-3.md). Status:

| # | Item | Status |
| --- | --- | --- |
| 1 | `loadRealRn` + native-module proxy shim | ✅ `react-native` boots in Node + Jest; `NativeModules` / `TurboModuleRegistry` resolve through a 3-tier proxy (per-fixture overrides → sync defaults → deep no-op). Fixture: `realRnHelloWorld` |
| 2 | `AssetRegistry` hook + capture-time `require()` interceptor | ✅ `require('./*.png')` produces an inline-`data:` URI source object; renderer decodes via existing `data:` path. Fixture: `realRnImageAsset` |
| 3 | `captureFromAppKey` (AppRegistry-driven entry) | ✅ `AppRegistry.registerComponent(key, …)` round-trips through `AppContainer-prod` so captures match what `ReactRootView` mounts on a real device. Fixture: `realRnRegisteredApp` |
| 4 | First-target integration (one screen from a public RN repo) | ✅ ramped leaf → screen across four tiers against `bluesky-social-app` (git-submoduled at `third_party/`; per-target resolver in `realAppResolver.ts` + `jestRnResolver.js` maps `#/...` tsconfig aliases + per-module mocks). **Tier 1** `Divider` (11 lines) end-to-end with one `#/alf` stub. **Tier 2** `Admonition` (150-line composite card; needed `alf`/`typography`/`button`/`icons` placeholder mocks). **Tier 3** `PasswordUpdatedForm` (43-line success page; added the `@lingui/*` macro stack — `msg` / `<Trans>` / `useLingui` — at runtime since the harness skips bsky's babel-plugin-macros). **Tier 4** `StepInterests` (~100-line onboarding screen rendered into a Pixel-5 viewport; added `Toggle` form context, `Onboarding` state + Layout pass-throughs, no-op `analytics` / `logger` / `Loader` stubs, plus a faithful resting-state slice of the real ~900-line `Button` so primary CTAs paint as solid pills with white text). |

### Developer-responsibility boundary

The harness handles the runtime plumbing (boot RN, intercept the
mount stream, paint it). Everything *above* the component being
rendered — props, context providers (navigation / Redux / theme),
mocked network/storage responses, animated target values,
placeholder swaps for unsupported children — is the developer's
test wrapper to write, the same way Storybook stories work. See the
"What the developer brings" section of
[`docs/phase-3.md`](docs/phase-3.md) for the contract.

## Phase 4 — device / theme matrix + perf

**Goal:** prove the "render one component across N configs in
parallel, faster than an emulator" value prop. See
[`docs/phase-4.md`](docs/phase-4.md) for the plan and per-step
status.

| # | Item | Status |
| --- | --- | --- |
| 1 | Device matrix | ✅ `DeviceProfile` + `DeviceMatrixSnapshotTest` render `blueskyOnboardingInterests` across 4 Android profiles (smallPhone / pixel5 / pixel7Pro / tablet), each with its own bootstrap-cached layoutlib session and per-config PNG golden under `src/test/snapshots/matrix/` |
| 2 | Theme matrix (light / dark / dim) | ⏳ needs a `theme` parameter that flows into bsky's `useTheme()` mock |
| 3 | Font scale + locale | ⏳ not started — locale ties to Phase 2.5 #6 (RTL) |
| 4 | Perf benchmark vs emulator baseline | ⏳ not started |
| 5 | Parallel matrix execution | ⏳ not started — currently sequential per JUnit method |
