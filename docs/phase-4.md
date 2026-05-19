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

## Step 2b — font-scale matrix (✅ landed)

Re-ordered ahead of the original step 2 (theme matrix) because
font scale is a more common source of real-world layout breakage
than theming.

Renders the screen-sized fixture on a single device (Pixel 5) at
five curated [FontScale] buckets that bracket iOS Dynamic Type
and Android's "Font size" system setting:

| Bucket            | Scale | Matches |
| ---               | ---   | --- |
| COMPACT           | 0.85  | Android "Small" / iOS xSmall–Small bracket |
| DEFAULT           | 1.00  | Both OSes' factory default |
| LARGE             | 1.30  | Android "Largest" / iOS xxxLarge — top of stock range |
| ACCESSIBILITY     | 2.00  | iOS Dynamic Type Accessibility mid-range (AX2–AX3) |
| ACCESSIBILITY_MAX | 3.10  | iOS AX5 — extreme stress test |

### What's in place

| Path | Purpose |
| --- | --- |
| `renderer/src/main/kotlin/.../FontScale.kt` | `data class FontScale(name, scale)` + the curated 5-entry `ALL` list. |
| `SnapshotRenderer` / `LayoutlibTextMeasurer` / `FabricViewBuilder` / `ParagraphTextBuilder` | New `fontScale: Float = 1.0f` plumbed through; multiplies `fontSize` everywhere it lands on a TextView or per-span `AbsoluteSizeSpan`. |
| `renderer/src/test/kotlin/.../FontScaleMatrixSnapshotTest.kt` | One `@Test` per bucket on `blueskyOnboardingInterests` at the default device; goldens under `matrix/<fixture>_<device>_fs_<bucket>.png`. |
| `Main.kt` `--fontScale N` flag | CLI surface for one-off renders at a specific scale. |

### Scope decisions

- **Device × fontScale cross product skipped.** Font scale and
  device size are largely orthogonal; 5 × 4 would mostly produce
  redundant goldens. Matrix runs scales on one device, devices
  on one scale. Add cross-product entries only when a specific
  fixture surfaces a device-scale interaction.
- **Container dimensions unchanged.** Pills retain their
  `paddingVertical: 15` and `paddingHorizontal: 24` regardless of
  font scale — text grows, container chrome doesn't. Matches how
  real RN apps behave by default; flex_wrap pushes overflowing
  rows down. Surfacing that breakage *is* the matrix's job.
- **No lineHeight scaling.** Per-atom `leading_relaxed: 24` etc.
  stay fixed. Real iOS scales lineHeight with fontSize via font
  metrics; we don't. Text at 3.10x can therefore visibly overlap
  at extreme scales — captured in the a11yMax golden.

### Findings

- The renderer correctly applies scale end-to-end. At 3.10x the
  StepInterests headline ("What are your interests?") wraps every
  word onto its own line; the description paragraph triples in
  height; the first interest pill only starts to appear at the
  bottom of the canvas.
- Same "Software Dev" truncation bug surfaces at COMPACT (0.85x)
  on Pixel 5 — repro that's independent of the tablet device
  width seen in step 1, which strengthens the case that it's a
  Yoga flex-wrap intrinsic-width issue rather than a wide-canvas
  edge case.

## Step 3 — theme matrix (✅ landed)

Renders the screen-sized fixture on a single device (Pixel 5) at
two color schemes (light + dark), driven by the platform
[`useColorScheme()`](https://reactnative.dev/docs/usecolorscheme)
hook rather than an app-level abstraction. That's the same API
real RN apps derive their theme from (bsky's
`useColorModeTheme` reads it directly), so the mock contract
matches what a real device color-scheme change would do.

Unlike the device + font matrices, theme actually changes the
*captured* mount-instruction stream — different palette colors
land in props at render time. So the harness captures the
fixture twice: once at `useColorScheme()='light'`
(`out/<fixture>.json`, no suffix), once at `'dark'`
(`out/<fixture>__dark.json`). The renderer test just picks the
matching JSON; no renderer-side theme parameter exists.

### What's in place

| Path | Purpose |
| --- | --- |
| `rn-harness/src/loadRealRn.ts` | New `setColorScheme(scheme)` helper. Replaces RN's `useColorScheme` lazy-getter with a fixed-value descriptor — the hook is overridden in place rather than at any app-level mock boundary. |
| `rn-harness/src/realApp/blueskyMocks/alf.ts` | Parallel `STATIC_THEME_LIGHT` + `STATIC_THEME_DARK` palettes; `useTheme()` calls `useColorScheme()` from `react-native` and switches. Mirrors bsky's real `useColorModeTheme` path. |
| `rn-harness/src/realApp/blueskyMocks/typography.tsx` | `Text` now applies `t.atoms.text` color as a base (matches real `Typography.tsx:32-33`). Without this every span inherited the TextView default (black) regardless of theme. |
| `rn-harness/fixtures/realApp/bluesky-onboarding-interests.ts` | Wrapper container's `backgroundColor` now reads from `useTheme().atoms.bg` instead of hard-coding white. |
| `rn-harness/src/captureFixtures.ts` | Loop now writes per-theme captures for matrix-targeted fixtures (`THEMED_FIXTURES` set). Default light capture keeps the unsuffixed filename so existing tests are unaffected. |
| `rn-harness/test/mount-instructions.test.ts` | Re-renders each variant under its captured color scheme so capture stability is enforced for both. |
| `renderer/src/main/kotlin/.../ColorScheme.kt` | `data class ColorScheme(name, captureSuffix)`. Kotlin doesn't read this for rendering — it's a discriminator for which input JSON / golden filename to pick. |
| `renderer/src/test/kotlin/.../ThemeMatrixSnapshotTest.kt` | One `@Test` per scheme; goldens at `matrix/<fixture>_<device>_theme_<scheme>.png`. |

### Why platform API not app abstraction

Pinning the mock to `useColorScheme()` rather than e.g. `useTheme()`:

- Works for *any* RN app the harness might target later — bsky,
  another submodule, a homegrown app — without per-target theme
  plumbing.
- Mirrors the path a real device color-scheme change would take
  through the app, so the test surfaces theme-related bugs at the
  same boundary they'd manifest in production.
- Keeps the renderer entirely theme-agnostic. Unlike `fontScale`
  (multiplier applied at render time), theme is "just data in the
  mount stream" — the renderer never needs to know about it.

### Skipped scope

- **`'dim'` theme.** Real bsky has light / dark / dim. Dim is a
  subtle dark variant — adding it would mostly produce a
  near-duplicate golden. Easy to add when a fixture actually
  exercises it.
- **Cross-product with device / font matrices.** 2 themes × 4
  devices × 5 font scales = 40 PNGs of largely-redundant data.
  Theme runs on one device at default font; device + font axes
  run at the light theme.

### Findings

- Capture stability holds across both schemes — re-running
  `npm run capture` produces byte-identical JSON.
- Surfacing the typography `t.atoms.text` gap was the bug the
  theme matrix caught. Before the fix, dark-mode bodies still
  showed black headlines on a near-black background because the
  `OnboardingTitleText` mock relied on TextView's default text
  color. After: every Typography span picks up the active
  theme's text color via the same path real bsky uses.

## Step 3b — locale / RTL (⏳)

Couples to Phase 2.5 #6 (RTL) — `Configuration.locale` + Yoga
`setDirection(YogaDirection.RTL)`. RTL is the higher-value test
because it surfaces edge-aware style atoms (`marginStart` /
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
