# React Native Headless Snapshot Rendering — Explore Plan

## Goal

Build (or assemble) a rendering runtime that can take any React Native component, compute its Android-equivalent layout and produce pixel output on low-end Linux hardware, without an Android emulator or full native build. Target use case is **structural/visual snapshot testing** — not E2E behavioural testing. Anything outside basic view rendering and layout should no-op cleanly.

Secondary goal: fast iteration across many device formats, densities and themes for stress testing.

## Core thesis

RN's rendering pipeline has three layers:

1. **JS layer** — React components running on Hermes/JSC, producing the element tree.
2. **Shadow tree / Yoga layout** — C++ layer, already portable, no Android deps.
3. **Native views** — Android `View` instances (Paper) or Fabric's C++ mounting layer driving real Android views.

Layers 1 and 2 run fine on Linux today. The hard problem is layer 3: producing pixels that match what Android would draw, without the full Android OS underneath.

The high-leverage path is likely **bridging RN's Fabric mounting instructions into Android's `layoutlib`** (the Android-in-a-jar artifact that powers Android Studio's layout preview and Compose Previews). This avoids reconstructing the Android rendering stack from first principles.

## Prior art to study before building

- **Paparazzi** (Square) — closest existing thing. Runs Android View system on plain JVM via `layoutlib`, produces PNG snapshots on Linux without an emulator. Native Android / Compose only, not RN. Proves the general approach.
- **layoutlib** — Google's stripped-down Android framework that runs on a regular JVM. Powers Studio's preview pipeline. Single biggest leverage point.
- **react-test-renderer** and **@testing-library/react-native** — give you component trees and shallow rendering at the JS level. Useful for the JS-side plumbing.
- **react-native-owl**, Shopify's visual testing tooling — mostly route through real devices/emulators, but worth understanding where they compromised and why.
- **Storybook for React Native + Chromatic** — adjacent but typically web-based.

## Architecture sketch

```
┌─────────────────────────────────────────┐
│  JS process (Node or Hermes on Linux)   │
│  - React components                     │
│  - react-native JS runtime              │
│  - Fabric shadow tree + Yoga layout     │
│  - Serializes mount instructions ───────┼──┐
└─────────────────────────────────────────┘  │
                                             │  IPC / JNI
┌─────────────────────────────────────────┐  │
│  JVM process                            │◄─┘
│  - layoutlib (Android framework jar)    │
│  - Mount instruction → View translator  │
│  - Stubs for native modules we don't    │
│    care about                           │
│  - Renders to BufferedImage → PNG       │
└─────────────────────────────────────────┘
```

The key insight: Fabric's mount instructions ("create view of type X with props Y, insert at index Z") are already a clean abstraction boundary. If we can translate those into `layoutlib` `View` instantiations, layoutlib handles measure/layout/draw for us.

## Key considerations / things that will bite

### Text rendering
Android text uses Minikin + ICU + specific system fonts (Roboto, Noto). For snapshots that match real devices, we need those exact components with matching config. Doable — Minikin is open source and layoutlib already wires it up — but fiddly, and font licensing matters.

### Native modules and third-party views
Most non-trivial RN apps depend on:
- `react-native-reanimated`
- `react-native-svg`
- `react-native-screens`
- `react-native-gesture-handler`
- `react-native-safe-area-context`
- Various navigation libraries

Each has native Android code. Options per module:
1. Compile their Android implementation against layoutlib (best fidelity, most work).
2. Stub with a no-op that renders a placeholder view with correct dimensions.
3. Stub with a reasonable static approximation (e.g. SVG rendered via Skia directly, reanimated collapsed to its initial values).

**This is the practical ceiling on "any React component."** Audit the real codebase early.

### Fabric vs. Paper
- Fabric (new architecture): C++ core is more portable; mounting layer is cleaner to intercept.
- Paper (old): UIManager/ViewManager is JVM-centric and actually fits layoutlib nicely.

Pick target based on what the codebase actually uses today and in the next 12 months.

### Hermes integration
Running Hermes inside a JVM process is awkward. Two reasonable options:
- **Separate processes**: JS in Node (or Hermes CLI), serialize shadow tree / mount instructions to JSON or flatbuffers, consume in JVM process. Simpler, slower, more debuggable.
- **JNI**: Hermes embedded in JVM via its C++ API. Faster, much more complex.

Start with separate processes.

### Fidelity vs. speed tradeoff
Paparazzi-style rendering is fast but diverges from real devices on subtle things (certain shadows, blurs, some hardware-accelerated effects). For **structural/layout tests this is fine**. For pixel-perfect visual regression, expect edge cases. Document what's in and out of scope up front.

### Maintenance burden
Android API levels, RN versions, and Fabric internals all move. Layoutlib is tied to specific API levels and needs updating. This is real ongoing cost. Decide whether the team can own it.

### Resource resolution
Density buckets, themes, `?attr/` lookups, night mode — all of this needs to be configured per-snapshot. layoutlib handles it but the config surface is non-trivial.

### HWUI is probably not needed
Android's hardware-accelerated rendering layer (HWUI) assumes `Surface`/`SurfaceFlinger`. We can render through Skia directly to an offscreen surface for pixel-accurate output on most drawing ops. HWUI is mostly about performance and display integration, not about what pixels look like.

## Exploration phases

### Phase 0: Validate layoutlib on Linux
**Goal**: prove the premise that Android's view system runs headless on Linux.

- Get Paparazzi running on a Linux box (not just macOS).
- Run their examples, confirm PNG output for trivial native Android views.
- Measure: cold start time, per-snapshot render time, memory footprint on low-end HW.
- Exit criteria: reproducible PNG snapshots of `TextView`, `LinearLayout`, `ConstraintLayout`, `ImageView` with no emulator in the loop.

### Phase 1: Understand Fabric's mount instruction surface
**Goal**: characterise what needs to cross the JS→native boundary.

- Run a minimal RN app with Fabric enabled; log the mount instructions from the mounting coordinator (`FabricUIManager` on Android side, or instrument the C++ `MountingManager`).
- Catalogue the instruction types: `Create`, `Insert`, `Remove`, `UpdateProps`, `UpdateLayoutMetrics`, etc.
- Confirm the instruction stream is fully self-contained (i.e., has everything needed to recreate the view tree without JS callbacks).
- Exit criteria: a JSON dump of mount instructions for 3–5 real-ish screens, plus a mapping doc from instruction → intended Android view op.

### Phase 2: Minimum viable bridge
**Goal**: translate mount instructions → layoutlib views for a tiny component set.

- Pick the smallest possible set: `View`, `Text`, `Image`, maybe `ScrollView`.
- Hand-translate Phase 1's captured instructions into layoutlib `View` instantiations.
- Produce a PNG. Compare against an emulator screenshot of the same component.
- Exit criteria: pixel-comparable (not pixel-identical — define a diff threshold) snapshot for a simple screen.

### Phase 3: Native module audit and stubbing strategy
**Goal**: quantify the "any component" scope ceiling.

- Take the three most important screens in the real target codebase.
- Enumerate every native module / custom view manager they touch.
- For each, decide: compile, stub-to-placeholder, stub-to-approximation.
- Exit criteria: concrete per-module plan and an honest coverage estimate (e.g. "we can snapshot 70% of screens with full fidelity, 20% with placeholders, 10% blocked").

### Phase 4: Device/theme matrix and perf
**Goal**: prove the stress-testing value prop.

- Parametrise layoutlib config (screen size, density, night mode, font scale, locale).
- Render the same component across N configurations in parallel.
- Benchmark vs. emulator baseline. Target: at least 10x faster wall-clock per snapshot, ideally much more.
- Exit criteria: a single CI-runnable command that produces a grid of snapshots across device formats in under X seconds.

### Phase 5: Productionisation (only if phases 0–4 land)
- Packaging (probably a Gradle plugin + npm CLI).
- Integration with existing snapshot diff tooling.
- Docs, failure modes, CI examples.
- Decision point on Fabric vs. Paper support matrix.

## Concrete first experiments (in order)

1. **Paparazzi on Linux smoke test.** Does it produce sensible PNGs for trivial native views without an emulator? Validates the layoutlib-on-Linux premise.
2. **Fabric mount instruction capture.** Instrument RN, write a minimal component, dump the mount instruction stream. Tells us how painful the bridge will be.
3. **Top-3 screen native module audit.** For the real target codebase, what native modules do the important screens depend on? Tells us the real scope of the stubbing problem.

If all three look tractable → viable path. If #3 reveals that 80% of screens depend on reanimated or custom native views that can't easily be stubbed → project is much larger than it first appears, reassess.

## Open questions

> **Note:** this is the original exploration doc. Two of the questions below
> are now decided — annotated inline. The forward-looking backlog lives in
> [`docs/roadmap.md`](roadmap.md).

- ~~Target RN architecture (Fabric only, Paper only, both)?~~
  **Decided: Fabric only** — the capture front-end is built entirely on the
  Fabric mount-instruction stream.
- ~~Whether to support iOS targets.~~ **Decided: two engines by design** —
  Android (layoutlib, in-process) and iOS (simulator over HTTP via
  `rn-ios-render-server`) share the `rn-harness` capture front-end. See
  [`docs/roadmap.md`](roadmap.md).
- Target Android API level for the layoutlib artifact?
- How much divergence from real-device rendering is acceptable for "structural" tests? Need a concrete diff metric.
- Is there a path where we skip layoutlib entirely and render through Skia + a hand-rolled minimal view system? Probably not worth it, but worth a day of thought.
- Font licensing for shipping Roboto/Noto in the test runner.
- Does anyone else want this? Check if there's a community project in this space we can contribute to rather than build standalone.

## Risks

- **Layoutlib is an internal-ish Google artifact.** It's available but not a supported public API surface. Could change or break between Android releases.
- **Third-party native views are a long tail.** The 80/20 on module stubbing may become 50/50 in practice.
- **Text fidelity edge cases.** Emoji, RTL, complex scripts, font fallback — these will produce subtle diffs and eat time.
- **RN's own rendering changes.** Fabric is still evolving. Internals we depend on may move.
- **Maintenance.** This is a platform project masquerading as a tool. Budget accordingly.

## Success criteria (rough)

- Produces a PNG snapshot of a real RN screen on Linux in < 2s, amortised.
- Runs on commodity hardware (think 4 vCPU, 8 GB RAM, no GPU).
- Handles at least 80% of the target codebase's screens without per-screen special casing.
- Device/theme matrix of 10 configurations renders in under 30s total.
- CI integration is a single command.
