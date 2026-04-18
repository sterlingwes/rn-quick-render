# rn-quick-render

Headless React Native snapshot rendering on Linux. See
[`docs/explore-plan.md`](docs/explore-plan.md) for the full exploration plan.

## Phase 0 — layoutlib validation

**Goal:** prove Android's view system runs headless on a plain Linux JVM (no
emulator, no SDK platform images) by driving Paparazzi on a low-end host.

**Exit criteria:**
- Reproducible PNG snapshots of `TextView`, `LinearLayout`, `ConstraintLayout`,
  `ImageView` without an emulator in the loop.
- Recorded cold-start latency, per-snapshot render time, and RSS footprint.

### What this module contains

| File | Purpose |
| --- | --- |
| `snapshots/` | Android library module. Applies the Paparazzi Gradle plugin. |
| `snapshots/src/test/.../Phase0ViewsTest.kt` | The four probe snapshots for the exit criteria. |
| `snapshots/src/test/.../Phase0PerfHarness.kt` | Warm-render loop that captures cold-start time, per-snapshot ms, RSS delta, and writes `build/phase0-metrics.json`. |
| `snapshots/src/main/res/` | Minimal resources — one vector drawable, one color/string table. |
| `scripts/phase0.sh` | `record` / `verify` / `perf` / `all` local driver. |
| `.github/workflows/phase-0-snapshot.yml` | CI job that records or verifies snapshots and publishes the metrics JSON and PNGs as build artifacts. |

### Toolchain

| Dependency | Version | Source |
| --- | --- | --- |
| JDK | 17 | any distribution |
| Gradle wrapper | 8.9 | `services.gradle.org` |
| Android Gradle Plugin | 8.5.2 | Google Maven (`dl.google.com/dl/android/maven2`) |
| Kotlin | 2.0.21 | Maven Central / Google Maven |
| Paparazzi | 1.3.5 | Gradle Plugin Portal + Maven Central |
| `layoutlib-native-linux` | 2023.2.1-6c7316c (API 34) | Maven Central, pulled transitively |

Paparazzi 1.3.5 bundles a Linux-native layoutlib binary as
`app.cash.paparazzi:layoutlib-native-linux`, which is what lets the Android
framework render to a `BufferedImage` on a stock JVM.

### Local run

```bash
# First run: lay down golden PNGs under snapshots/src/test/snapshots/images/
scripts/phase0.sh record

# Subsequent runs: verify against the goldens
scripts/phase0.sh verify

# Perf numbers (writes snapshots/build/phase0-metrics.json)
scripts/phase0.sh perf

# Record + perf in one shot
scripts/phase0.sh all
```

The first run downloads ~300 MB of dependencies. Subsequent runs are offline.

### Metric shape

`Phase0PerfHarness` emits JSON like:

```json
{
  "jvm_to_first_snapshot_ms": 4125,
  "iterations": 5,
  "per_snapshot_ms": { "min": 83, "median": 121, "p95": 158, "max": 346, "total": 795 },
  "rss_kb": { "before": 350832, "after": 423564, "delta": 72732 }
}
```

(Numbers above are the first green CI run on `ubuntu-latest`, GitHub-hosted
runner — 4 vCPU / 16 GB. See _Phase 0 results_ below for interpretation.)

- `jvm_to_first_snapshot_ms` — wall-clock from JVM start to first completed
  `Paparazzi.snapshot()`. This is the "cold start" number for Phase 0 success
  criteria.
- `per_snapshot_ms` — wall-clock per additional `snapshot()` call. Distribution
  across N warm iterations (default 5).
- `rss_kb` — `/proc/self/status:VmRSS` before Paparazzi first boots vs. after
  the final snapshot. Gives a crude memory ceiling.

On CI the JSON is uploaded as the `phase0-metrics` artifact.

### Phase 0 results — exit criteria met

Measured on GitHub-hosted `ubuntu-latest` runner (4 vCPU / 16 GB):

| Metric | Value | Target / note |
| --- | --- | --- |
| JVM → first Paparazzi snapshot | **4.1 s** | One-time cold start per test-class JVM fork. |
| Per-snapshot median | **121 ms** | Well under the `< 2 s per screen` Phase 5 goal. |
| Per-snapshot p95 | **158 ms** | |
| Per-snapshot max | **346 ms** | First warm iteration absorbs trailing JIT / class-load cost. |
| 5 warm iterations total | **795 ms** | ~159 ms amortised. |
| Paparazzi-induced RSS delta | **+71 MB** | Baseline JVM ~343 MB → ~414 MB after layoutlib boot. |

Four probe PNGs (`TextView`, `LinearLayout`, `ConstraintLayout`, `ImageView`)
land under `snapshots/src/test/snapshots/images/` and are uploaded as the
`phase0-snapshots` CI artifact. The four snapshots are the Phase 0 exit
criteria from the explore plan.

### Status — what ran where

| Check | Where |
| --- | --- |
| Gradle 8.9 wrapper boots, parses `settings.gradle.kts` + module scripts | ✅ locally |
| Plugin resolution (`com.android.library`, `app.cash.paparazzi`) | ⚠ blocked in the Claude Code sandbox — outbound requests to `dl.google.com` are denied with `x-deny-reason: host_not_allowed`. Runs on CI. |
| Record four probe snapshots | ✅ CI run `24608977811` |
| Perf harness (`Phase0PerfHarness`) | ✅ CI, metrics above |

Paparazzi has a hard dependency on the Android Gradle Plugin (which lives only
on Google Maven). That's unavoidable at this phase because Paparazzi hooks into
AGP's variant + resource-processing pipeline. It does not require the Android
SDK platform tools, an emulator, or a device — just the plugin artifact plus
the `layoutlib-native-linux` .so bundle.

### Open items rolling into Phase 1

- Re-run perf on the actual low-end target host (4 vCPU / 8 GB) once available;
  GitHub's `ubuntu-latest` is a 16 GB box so the RSS ceiling isn't stressed.
- The Paparazzi bridge intentionally paints without HWUI. Document any
  drawable/shader divergence we see vs. a physical Pixel 5 before Phase 2
  lands the Fabric mount-instruction translator.
- 4.1 s cold start per JVM fork will compound if every test class forks. Decide
  whether to reuse a JVM across Paparazzi test classes (`--max-workers` /
  `forkEvery`) before Phase 4's device-matrix benchmarking.

### Repository layout

```
.
├── build.gradle.kts              # root — plugin aliases only
├── settings.gradle.kts           # single module :snapshots
├── gradle/
│   ├── libs.versions.toml
│   └── wrapper/…
├── snapshots/
│   ├── build.gradle.kts
│   └── src/
│       ├── main/
│       │   ├── AndroidManifest.xml
│       │   └── res/
│       │       ├── drawable/phase0_swatch.xml
│       │       └── values/{strings,colors}.xml
│       └── test/java/com/example/snapshot/
│           ├── Phase0ViewsTest.kt
│           └── Phase0PerfHarness.kt
├── scripts/phase0.sh
├── .github/workflows/phase-0-snapshot.yml
└── docs/explore-plan.md
```

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

### Open items rolling into Phase 2

- Add a concurrent-root fixture once the translator is under construction —
  concurrent updates can fragment the stream across multiple `completeRoot`
  calls and the Phase 1 stream assumes synchronous commits.
- Wire a real text measurer (Yoga + Minikin or layoutlib's `BridgeTypefaceCache`)
  before mount instructions hit Android views, otherwise `RCTParagraph`
  layouts will be nonsense.

## Phase 2 — Fabric → layoutlib translator

**Goal:** take a Phase 1 mount-instruction stream and paint it through
Paparazzi's layoutlib to a PNG on Linux. See
[`docs/phase-2-translator.md`](docs/phase-2-translator.md) for the
design writeup.

**Exit criteria:**
- Yoga runs in Node, emits `{x, y, width, height}` per node. Committed as
  `rn-harness/out/<fixture>.layout.json`.
- Kotlin translator reads instructions + layout, constructs a `FrameLayout`
  tree with absolute positioning (no Android-side layout work).
- Paparazzi captures one PNG per fixture; the PNGs are the Phase 2 goldens.
- Text / image fidelity is honestly labelled as a Phase 2.5 gap.

### New pieces

| Path | Purpose |
| --- | --- |
| `rn-harness/src/computeLayout.ts` | Reads a captured instruction stream, reconstructs the tree, runs Yoga, returns per-node rects. Installs a rough text-measure function for `RCTParagraph`. |
| `rn-harness/src/emitLayout.ts` | CLI that writes `out/<fixture>.layout.json` for all 5 fixtures. |
| `rn-harness/test/layout.test.ts` | Pins computed rects for simpleView + nestedViews against regressions. |
| `snapshots/src/test/java/com/example/snapshot/FabricTranslator.kt` | Instruction + layout JSON → Android `View` tree. FrameLayout-with-absolute-positioning everywhere. |
| `snapshots/src/test/java/com/example/snapshot/Phase2TranslatorTest.kt` | One Paparazzi `@Test` per fixture. |
| `.github/workflows/phase-2-translator.yml` | Regenerates layout JSON, diffs vs. committed, then records/verifies Phase 2 PNGs. |

### Phase 2 findings (in-progress)

- Moving Yoga to Node and treating layoutlib as a pure painter halves the
  JVM-side code size. The translator is ~200 lines.
- `yoga-layout@3.2.x` is ESM-with-top-level-await. Loaded via
  `import("yoga-layout/load")` inside an async entry point; Jest needs
  `--experimental-vm-modules` to exercise it.
- Text metrics are the long pole. A linear-per-character approximation
  produces believable container sizes but will diverge from real-device
  output on multi-line wrap, measurement of glyphs with non-default
  advance-width, and font fallback. Tracked as Phase 2.5.

### Local run

```bash
# Node side — regenerate both goldens.
npm --prefix rn-harness run capture
npm --prefix rn-harness run layout
npm --prefix rn-harness test

# JVM side — first run records, subsequent runs verify.
./gradlew :snapshots:recordPaparazziDebug --tests "*Phase2TranslatorTest*"
./gradlew :snapshots:verifyPaparazziDebug --tests "*Phase2TranslatorTest*"
```

### Open items rolling into Phase 2.5

- Replace the char-width text measurer with HarfBuzz/Minikin or layoutlib's
  `BridgeTypefaceCache` so paragraph metrics match device rendering.
- Wire image loading — currently `RCTImageView` paints a grey rect at the
  computed bounds.
- Handle `cloneNodeWithNewProps` and friends. Phase 1 fixtures are all
  initial mounts; the update path is unexercised.
- Map border/shadow/corner-radius/opacity/transform props.
- Add an RTL fixture and expose `direction` as a surface option.
