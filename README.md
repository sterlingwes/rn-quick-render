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
  "jvm_to_first_snapshot_ms": 0,
  "iterations": 5,
  "per_snapshot_ms": { "min": 0, "median": 0, "p95": 0, "max": 0, "total": 0 },
  "rss_kb": { "before": 0, "after": 0, "delta": 0 }
}
```

- `jvm_to_first_snapshot_ms` — wall-clock from JVM start to first completed
  `Paparazzi.snapshot()`. This is the "cold start" number for Phase 0 success
  criteria.
- `per_snapshot_ms` — wall-clock per additional `snapshot()` call. Distribution
  across N warm iterations (default 5).
- `rss_kb` — `/proc/self/status:VmRSS` before Paparazzi first boots vs. after
  the final snapshot. Gives a crude memory ceiling.

On CI the JSON is uploaded as the `phase0-metrics` artifact.

### Status — what ran where

| Check | Where |
| --- | --- |
| Gradle 8.9 wrapper boots, parses `settings.gradle.kts` + module scripts | ✅ locally |
| Plugin resolution (`com.android.library`, `app.cash.paparazzi`) | ⚠ blocked in the Claude Code sandbox — outbound requests to `dl.google.com` are denied with `x-deny-reason: host_not_allowed`. Runs on any host with standard Google Maven access (GitHub Actions `ubuntu-latest`, local dev boxes, most CI). |
| Record four probe snapshots + perf harness | 🟡 pending — runs on first push to CI. See `.github/workflows/phase-0-snapshot.yml`. |

Paparazzi has a hard dependency on the Android Gradle Plugin (which lives only
on Google Maven). That's unavoidable at this phase because Paparazzi hooks into
AGP's variant + resource-processing pipeline. It does not require the Android
SDK platform tools, an emulator, or a device — just the plugin artifact plus
the `layoutlib-native-linux` .so bundle.

### Open items rolling into Phase 1

- Capture the actual Phase 0 metric numbers from CI and land them here (replace
  the zeroed example above).
- If `layoutlib-native-linux` peak RSS exceeds the 8 GB target, profile and
  decide whether to cap `Paparazzi` instances per JVM fork (fork per test
  class is Gradle's default).
- The Paparazzi bridge intentionally paints without HWUI. Document any
  drawable/shader divergence we see vs. a physical Pixel 5 before Phase 2
  lands the Fabric mount-instruction translator.

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
