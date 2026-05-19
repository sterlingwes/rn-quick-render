# Phase 4 — device / theme matrix + perf

The Phase 4 promise from the explore plan: render one component
across N device / theme / font / locale configurations,
demonstrably faster than an emulator-backed snapshot tool. Five
sub-steps, all sized so each can land independently and ship
visible per-config goldens.

## Step 1 — device matrix (✅ landed)

Render the same fixture across a curated list of Android device
profiles, golden-diff each combination independently.

### What's in place

| Path | Purpose |
| --- | --- |
| `renderer/src/main/kotlin/.../DeviceProfile.kt` | `data class DeviceProfile(name, widthPx, heightPx, densityDpi)` with a curated `ALL = [SMALL_PHONE, PIXEL_5, PIXEL_7_PRO, TABLET]` covering the dp-width buckets RN `useBreakpoints()` tends to branch on (≤ 400 / ≤ 600 / ≤ 800 / > 800). |
| `renderer/src/test/kotlin/.../DeviceMatrixSnapshotTest.kt` | One `@Test fun <fixture>_<device>()` per combination. Each profile gets its own `LayoutlibBootstrap`, cached in a JVM-static `Map<DeviceProfile, LayoutlibBootstrap>` so `Bridge.init()` (~4 s) is paid once per profile, not once per test. |
| `renderer/src/test/snapshots/matrix/<fixture>_<device>.png` | Per-config golden. Sub-directoried to keep the flat top-level snapshots directory legible. |

### Findings so far

- **Layout differences are real and visible**: small phone (360
  dp) wraps the interest grid to 2–3 pills per row;
  tablet (928 dp) fits 7–8 per row. Pixel 5 / Pixel 7 Pro
  produce the same dp layout (393 / 411 dp) but at very different
  pixel densities, exercising the px-vs-dp conversions inside
  Yoga and the text measurer.
- **One bootstrap per profile**: `Bridge.init()` is the
  expensive call (~4 s on first invocation); `createSession` with
  a different `HardwareConfig` is cheap. Caching by profile keeps
  the matrix suite tractable.
- **Known fidelity gap**: on the tablet render, the "Software
  Dev" interest pill truncates to "Software". The same fixture +
  same mounted tree at other widths renders the full text, so
  this is a Yoga flex-wrap edge case at wider canvases rather
  than a tier-4 fixture bug. Captured here so the next pass
  doesn't lose it; lives logically under Phase 2.5.

### Currently scoped fixtures

- `blueskyOnboardingInterests` — the screen-sized tier-4 fixture
  where device size visibly changes the layout. Smaller composite
  fixtures (Divider / Admonition / PasswordUpdated) don't add
  much per-device signal.

### How to run

```bash
./gradlew :renderer:test --tests "com.example.renderer.DeviceMatrixSnapshotTest"

# Re-record committed goldens (intentional drift).
./gradlew :renderer:test -Drenderer.record=true \
    --tests "com.example.renderer.DeviceMatrixSnapshotTest"
```

## Step 2 — theme matrix (⏳)

Add a `theme` parameter that flows into bsky's `useTheme()` mock
(currently hard-coded to `'light'`). Re-render the matrix in
light + dark (+ possibly `'dim'`) and golden each per-theme PNG.

Scope this needs:

- Extend `STATIC_THEME` in `rn-harness/src/realApp/blueskyMocks/alf.ts`
  to ship parallel light + dark palettes and a way to switch.
- Either pass theme through a context or a global the mock reads,
  so swapping it doesn't require recompiling the harness.
- Bake a per-theme golden into `matrix/<fixture>_<device>_<theme>.png`.

## Step 3 — font scale + locale (⏳)

Two largely independent knobs:

- **Font scale.** RN exposes `PixelRatio.getFontScale()`; layoutlib
  reads font scale from the `Configuration`. Wire `DeviceProfile`
  to optionally carry a font scale factor; render each fixture at
  100 % + 130 % (the OS accessibility default) and golden-diff.
- **Locale.** Couples to Phase 2.5 #6 (RTL) — `Configuration.locale`
  + Yoga `setDirection(YogaDirection.RTL)`. RTL is the higher-value
  test because it surfaces edge-aware style atoms (`marginStart` /
  `marginEnd` vs `marginLeft` / `marginRight`).

## Step 4 — perf benchmark vs. emulator baseline (⏳)

The explore-plan claim is "at least 10x faster than emulator,
ideally much more." Establish a baseline:

- Wire JVM timing around `SnapshotRenderer.render()` and around
  the full per-test flow (bootstrap → render → write PNG).
- Measure cold (first call, includes `Bridge.init()`) and warm
  (subsequent calls, cached bootstrap) separately.
- Record p50 / p95 per fixture and per device profile.
- Commit a baseline numbers file (`docs/phase-4-baseline.md`) and
  a tiny CI assertion that the warm-render p95 doesn't regress
  more than 2x.
- Capture the emulator number from a known-good Paparazzi or
  emulator-snapshot setup as the comparison point (the Phase 0
  retrospective has rough Paparazzi numbers we can use:
  121 ms median, 158 ms p95).

## Step 5 — parallel matrix execution (⏳)

Current matrix runs sequentially: JUnit fires `@Test` methods
one after the other on a single thread. The wall-clock benefit
of the matrix only shows up once it parallelizes.

Options:

- **JUnit `@Test(parallel = true)` via Gradle `test.maxParallelForks`**.
  Each fork is a separate JVM, so each pays `Bridge.init()` once;
  per-profile bootstrap caching becomes per-fork bootstrap caching.
- **JUnit 5 parallel execution.** More fine-grained — one JVM,
  multiple threads. Layoutlib's `RenderSession` thread-safety is
  the open question; needs a probe before committing.
- **Custom parallel runner.** Cross-product the fixture × profile
  list explicitly, schedule onto a coroutine / Executor pool, write
  PNGs in parallel, golden-diff in parallel. Easiest to control
  per-thread bootstrap allocation but bypasses JUnit's test
  reporting.

Probably JVM-forking first — cheapest to wire and easiest to
explain in a Gradle task. Decide after step 4 lands a baseline
to know how much parallelism actually buys us.
