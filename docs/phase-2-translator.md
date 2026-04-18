# Phase 2 — Fabric → layoutlib translator

Two new moving parts on top of Phase 1:

1. **Yoga in Node.** `rn-harness/src/computeLayout.ts` re-walks the committed
   mount-instruction stream, mirrors it into a Yoga tree, and computes every
   node's `{left, top, width, height}` in dp. The output is `out/<fixture>.layout.json`.
2. **JVM translator.** `snapshots/src/test/java/com/example/snapshot/FabricTranslator.kt`
   reads both JSONs and materialises an Android `View` tree. The paired
   Paparazzi test (`Phase2TranslatorTest`) snapshots each fixture to PNG.

The seam between them is deliberately narrow: the translator never sees flexbox
style props like `flexDirection` or `padding`. By the time it runs, Yoga has
already resolved everything to absolute `FrameLayout.LayoutParams` positions.
layoutlib is reduced to a pure painter.

## Why Node-side Yoga

A Fabric shadow tree has two responsibilities: (1) hold declarative styles, and
(2) solve them into concrete pixel rects via Yoga. On a real device, step 2
happens in C++ and the result lives on each ShadowNode. Our harness skips the
C++ runtime entirely — running `yoga-layout` in Node is the cleanest way to
recover that result without standing up a Fabric shadow-tree implementation.

Tradeoffs:

- **Pro:** the JVM side needs zero layout logic. It just instantiates Views and
  places them at the rects Yoga computed. No flex-to-LinearLayout translator,
  no child-sizing heuristics.
- **Pro:** Yoga's `measureFunc` hook is available in JS, so we can plug in a
  real text measurer (Phase 2.5) without touching the JVM side.
- **Con:** we diverge from how real Fabric does it (C++ Yoga + JSI bridge
  to a native text measurer). A shipping product would almost certainly move
  Yoga back to the JVM via `yoga-layout` JNI bindings, but that's a Phase 4
  concern.

## Mount-instruction → Yoga-node mapping

| Fabric viewName | Yoga behaviour | Android view in Phase 2 |
| --- | --- | --- |
| `RCTView` | Regular flex container | `FrameLayout` |
| `RCTScrollView` | Flex container sized to the viewport | `ScrollView` wrapping one child |
| `RCTScrollContentView` | Flex container; its natural size drives scroll extent | `FrameLayout` |
| `RCTImageView` | Flex leaf with explicit width/height | `ImageView` (solid placeholder in Phase 2) |
| `RCTParagraph` | Flex leaf with `setMeasureFunc` using concatenated text | `TextView` |
| `RCTRawText` | **Skipped** — not a Yoga node. Owns the string. | Consumed by the parent `RCTParagraph`'s `TextView.text`. |

Text measurement in Phase 2 is intentionally crude: `fontSize * 0.55` per
character, `fontSize * 1.25` line height, wrap at available width. That's
enough for fixtures to size containers believably; the actual pixel diff vs.
a real device is tracked as a known gap (see below).

## File topology

```
rn-harness/
├── src/
│   ├── computeLayout.ts   # Yoga tree build + layout pass
│   └── emitLayout.ts      # CLI: reads out/*.json, writes out/*.layout.json
├── test/layout.test.ts    # pins expected rects for simpleView + nestedViews
└── out/
    ├── simpleView.json        (Phase 1)
    ├── simpleView.layout.json (Phase 2)
    └── … one layout per fixture …

snapshots/
├── src/test/java/com/example/snapshot/
│   ├── FabricTranslator.kt        # instruction + layout → View tree
│   └── Phase2TranslatorTest.kt    # Paparazzi @Test per fixture
└── src/test/snapshots/images/     # committed Phase 2 PNGs
```

## Known gaps

Each of these will produce a visible diff against a real device. They're
intentional for Phase 2; see the open items in the top-level README.

- **Text rendering.** Stubbed measurer → text rects are approximate. Real
  device uses Minikin + ICU + Roboto. Phase 2.5 swaps in a real measurer.
- **Image loading.** `RCTImageView` is a solid grey rectangle at the correct
  bounds. Real device loads from `source.uri`, scales via `resizeMode`.
  Phase 3 wires an image pipeline.
- **Text nested styling.** A single `TextView` renders the paragraph's
  concatenated text; nested `<Text>` styling (weight spans, colour runs) is
  collapsed. Needs `SpannableStringBuilder` / spans. Phase 2.5.
- **Borders, shadows, corner radius.** Not read from props yet.
- **`transform` / `opacity`** — ignored.
- **RTL** — hard-coded `DIRECTION_LTR` at the Yoga root.

## Running locally

```bash
# Node side
npm --prefix rn-harness run capture   # regenerate instruction goldens
npm --prefix rn-harness run layout    # regenerate layout goldens
npm --prefix rn-harness test          # unit-tests for both

# JVM side (requires CI-level network access — dl.google.com is blocked locally)
./gradlew :snapshots:recordPaparazziDebug --tests "*Phase2TranslatorTest*"
./gradlew :snapshots:verifyPaparazziDebug --tests "*Phase2TranslatorTest*"
```
