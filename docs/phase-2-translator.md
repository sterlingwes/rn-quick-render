# Phase 2 — Fabric → layoutlib renderer

Phase 1 captured Fabric mount instructions to JSON in Node. Phase 2 turns
those JSON streams into PNGs by driving Android's `layoutlib` directly on a
plain JVM — no Paparazzi, no Android Gradle Plugin, no emulator.

The whole pipeline runs JVM-side in a single module (`renderer/`):

```
   rn-harness/out/<fixture>.json
              │
              ▼
   ┌──────────────────────────┐
   │ YogaLayoutEngine         │  Yoga 3.2.1 via JNI (built from source).
   │  + LayoutlibTextMeasurer │  Text measured with TextPaint + StaticLayout
   └──────────────────────────┘  on the fonts layoutlib loaded.
              │
              ▼  per-node {left, top, width, height} in dp
   ┌──────────────────────────┐
   │ FabricViewBuilder        │  Translates instructions + rects into
   │                          │  FrameLayout-with-absolute-positioning,
   │                          │  TextView, ImageView, ScrollView.
   └──────────────────────────┘
              │
              ▼
   ┌──────────────────────────┐
   │ LayoutlibBootstrap       │  Bridge.init() with fonts / ICU / native
   │  + SnapshotRenderer      │  libs from `layoutlib-runtime`. View tree
   │                          │  is measured, laid out, and drawn to a
   │                          │  Bitmap → BufferedImage → PNG.
   └──────────────────────────┘
              │
              ▼
   renderer/build/snapshot-output/<fixture>.png
   (diffed against renderer/src/test/snapshots/<fixture>.png)
```

## Why direct layoutlib instead of Paparazzi

Phase 0 used Paparazzi to validate that layoutlib runs headless on Linux.
That premise stood; Paparazzi itself did not survive contact with Phase 2.
Paparazzi pulls the Android Gradle Plugin into the build to reuse its
variant + resource-processing pipeline. That's overhead we don't need —
we're not building an Android app, we're loading `layoutlib-native-linux`
and asking the Bridge to render a View tree.

Direct layoutlib bootstrap (see `LayoutlibBootstrap.kt`) trades a one-time
implementation cost (~150 lines of `Bridge.init`, framework-resource
loader, stub `LayoutlibCallback`/`ResourceResolver`) for:

- No AGP dependency, no `dl.google.com` plugin resolution.
- A plain `application`-plugin Kotlin module that builds with any
  JDK 17 + CMake.
- Direct control over the render session: when it boots, how it
  measures, what gets drawn.
- Yoga runs in the same process, so a future native text measurer plugs
  straight into Yoga's `setMeasureFunction` without crossing a process
  boundary.

## Why Yoga in the JVM (and not Node)

The first sketch ran Yoga in Node via `yoga-layout`, mirroring what real
Fabric does in C++ on-device. Two problems with that split:

- The JVM still needs a text measurer that knows about Android fonts.
  Splitting layout (Node) from measurement (JVM) means the JVM measures
  text, ships rects back, Node re-runs layout — or Node uses a fake
  measurer and the rects drift from how Android would lay out the
  paragraph.
- Two languages, two build systems, two test surfaces for what is
  fundamentally one pass.

The current renderer keeps Yoga in the JVM via JNI bindings built from
the Yoga submodule (`yoga/`). `YogaLayoutEngine` is the Kotlin port of
the old `computeLayout.ts` — same tree reconstruction, same style
mapping, same measure-function hook — feeding into `LayoutlibTextMeasurer`
which uses `TextPaint` + `StaticLayout` against layoutlib's bundled
Roboto. The JS-side Yoga deps and `*.layout.json` goldens are gone.

## Mount-instruction → View mapping

| Fabric viewName | Yoga behaviour | Android view |
| --- | --- | --- |
| `RCTView` | Flex container | `FrameLayout` |
| `RCTScrollView` | Flex container sized to the viewport | `ScrollView` wrapping one child |
| `RCTScrollContentView` | Flex container; natural size drives scroll extent | `FrameLayout` |
| `RCTImageView` | Flex leaf with explicit width/height | `ImageView` (solid placeholder) |
| `RCTParagraph` | Flex leaf with `setMeasureFunction` (real measurer) | `TextView` |
| `RCTRawText` | **Skipped** — not a Yoga node. Owns the string. | Consumed by the parent `RCTParagraph`'s `TextView.text`. |

The seam between layout and rendering is intentionally narrow: the
builder never sees flexbox style props like `flexDirection` or
`padding`. By the time it runs, Yoga has resolved everything to absolute
`FrameLayout.LayoutParams` positions. layoutlib is reduced to a painter.

## File topology

```
renderer/
├── build.gradle.kts                    # Yoga CMake build, layoutlib extraction
├── cmake/CMakeLists.txt                # JNI lib build
└── src/
    ├── main/
    │   ├── java/com/facebook/yoga/
    │   │   └── YogaNative.java         # Patched: System.loadLibrary, no SoLoader
    │   └── kotlin/com/example/renderer/
    │       ├── LayoutlibBootstrap.kt   # Bridge.init() + RenderSession
    │       ├── FrameworkResourceLoader.kt
    │       ├── EmptyLayoutParser.kt
    │       ├── ResourceResolverStub.kt
    │       ├── StubLayoutlibCallback.kt
    │       ├── StderrLayoutLog.kt
    │       ├── YogaLayoutEngine.kt     # Yoga tree build + layout pass
    │       ├── LayoutlibTextMeasurer.kt# TextPaint + StaticLayout
    │       ├── FabricViewBuilder.kt    # Instructions + rects → View tree
    │       ├── SnapshotRenderer.kt     # End-to-end orchestrator
    │       └── Main.kt                 # CLI: stdin JSON → PNG
    └── test/
        ├── kotlin/com/example/renderer/
        │   ├── YogaSmokeTest.kt
        │   ├── YogaLayoutTest.kt
        │   ├── LayoutlibBootstrapTest.kt
        │   ├── LayoutlibTextMeasurerTest.kt
        │   ├── FabricViewBuilderTest.kt
        │   └── SnapshotRendererTest.kt # 5 fixture golden-diff tests
        └── snapshots/                  # Committed PNG goldens
            ├── simpleView.png
            ├── nestedViews.png
            ├── textAndImage.png
            ├── scrollView.png
            └── conditional.png

yoga/                                   # git submodule @ v3.2.1
```

## Local run

```bash
# Verify against committed goldens.
./gradlew :renderer:test

# Re-record committed goldens (intentional drift).
./gradlew :renderer:test -Drenderer.record=true

# One-off render via the CLI.
cat rn-harness/out/simpleView.json | \
  ./gradlew :renderer:run --args="--output /tmp/simpleView.png" -q
```

The CMake step builds `libyoga.so` (or `.dylib`/`.dll`) on first invocation
and caches under `renderer/build/yoga-native/`. The `extractLayoutlib`
task unpacks fonts / ICU / native libs from the `layoutlib-runtime` JAR
into `renderer/build/layoutlib-data/`.

## CI

`.github/workflows/phase-2-renderer.yml` runs on `ubuntu-latest`:

1. Checks out with `submodules: recursive` so the Yoga sources land.
2. Installs `cmake`, `build-essential`, `ninja-build` for the JNI build.
3. Caches `~/.gradle` + `renderer/build/yoga-native`.
4. Runs `./gradlew :renderer:test`.
5. Uploads `renderer/build/snapshot-output/*.png` as the
   `phase2-fresh-renders` artifact on every run (success or failure) —
   this is how new goldens are bootstrapped: download the artifact,
   commit the PNGs under `renderer/src/test/snapshots/`.

## Known gaps — Phase 2.5 backlog

Each of these will produce a visible diff against a real device. They're
intentional for Phase 2.

- **Image loading.** `RCTImageView` paints a grey rect at the computed
  bounds. Real device loads from `source.uri`, scales via `resizeMode`.
- **Nested text styling.** A single `TextView` renders the paragraph's
  concatenated text; nested `<Text>` styling (weight spans, colour runs,
  font family per span) is collapsed. Needs `SpannableStringBuilder` and
  span construction in `FabricViewBuilder.buildTextView`.
- **`cloneNodeWithNewProps` and friends.** Phase 1 fixtures are all
  initial mounts; the update path is unexercised on the JVM side.
- **`transform` / `opacity`.** Read from props, not applied.
- **Shadows.** Elevation/box-shadow props are not mapped.
- **RTL.** Hard-coded `DIRECTION_LTR` at the Yoga root; need to expose
  `direction` and add an RTL fixture.
- **Multiple `RenderSession`s.** A single bootstrap drives all fixtures.
  Per-fixture screen size / density would need either re-bootstrapping
  or per-render `setHardwareConfig`. Phase 4's device-matrix work has to
  decide.

## Open questions rolling into Phase 3

- Native-module audit on a real target codebase. The instruction stream
  is self-contained for structural mount, but Reanimated / gesture
  handler / SVG emit mount changes from native threads that never reach
  our captured JSON. How much real-world coverage do we lose?
- Image decode cost vs. snapshot wall-clock. If we cache decoded
  bitmaps across fixtures the per-snapshot budget changes character.
