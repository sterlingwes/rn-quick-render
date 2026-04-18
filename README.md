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
