# rn-quick-render

Headless React Native snapshot rendering on Linux. Phase 1 captures
Fabric mount instructions in Node; Phase 2 paints them through Android's
`layoutlib` to PNGs on a plain JVM (no Paparazzi, no AGP, no emulator).

See [`docs/explore-plan.md`](docs/explore-plan.md) for the full
exploration plan and [`docs/phase-2-translator.md`](docs/phase-2-translator.md)
for the current renderer design.

## Status at a glance

| Phase | What | Status |
| --- | --- | --- |
| 0 | Paparazzi validates layoutlib-on-Linux | ✅ done — retrospective only, module deleted |
| 1 | Fabric mount-instruction capture in Node | ✅ 5 fixtures, CI green |
| 2 | Direct layoutlib renderer (Yoga JNI + text measurer + view builder) | 🟡 code landed, PNG goldens being bootstrapped |
| 2.5 | Text spans, image loading, transforms, RTL, updates | ⏳ backlog |
| 3 | Native-module audit on a real codebase | ⏳ not started |
| 4 | Device / theme matrix + perf | ⏳ not started |
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
empty. First CI run:

1. Renders all five fixtures into `renderer/build/snapshot-output/`.
2. Uploads them as the `phase2-fresh-renders` artifact.
3. Tests fail with `no committed golden at …`.

Download the artifact, eyeball the PNGs, and commit them to
`renderer/src/test/snapshots/`. Subsequent runs verify against those
goldens and fail (uploading the fresh renders for inspection) when
pixels drift.

### Phase 2.5 backlog

- **Nested text styling.** `<Text>` weight / colour spans collapse into
  the parent paragraph; needs `SpannableStringBuilder` in `buildTextView`.
- **Image loading.** `RCTImageView` paints a grey rect; need `source.uri`
  + `resizeMode` handling.
- **`cloneNodeWithNewProps` and friends.** Phase 1 fixtures are all
  initial mounts; the update path is unexercised on the JVM side.
- **`transform` / `opacity` / shadows.** Read from props, not applied.
- **RTL.** Hard-coded `DIRECTION_LTR` at the Yoga root; add an RTL fixture
  and expose `direction`.
- **Concurrent-root capture.** Phase 1 stream assumes synchronous
  commits; the translator should be exercised against a fixture that
  spans multiple `completeRoot` calls before Phase 3.
