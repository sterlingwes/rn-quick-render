# Phase 2.5 — fidelity on top of Phase 2

Phase 2 lands a working layoutlib renderer end-to-end (Yoga JNI +
`Bridge.init` + Fabric translator + golden PNG tests on CI). Phase 2.5
closes the gap between *structurally correct* and *visually matches a
device*. Items are roughly ordered by how disruptive they are to the
existing goldens — fixing the outline anomaly first is cheap; image
loading and text spans will shift many goldens at once.

## 1. ScrollView row outline anomaly (resolved)

### Original symptom

In `renderer/src/test/snapshots/scrollView.png` each `RCTView` row
*looked* like it had a 1 px outline and soft corners, even though the
fixture only sets `backgroundColor` + `height` + `marginBottom`. The
same faint edge appeared at the bottom of the outer container in
`conditional.png` and `textAndImage.png`.

### Outcome

`ScrollViewOutlineInvestigationTest` sampled seven pixels around row 1
of the scrollView fixture on CI. Result:

```
row1 interior (deep)                  #EEEEEE (a=255)
row1 top edge    (y = first in-row)   #EEEEEE (a=255)
row1 top - 1     (in padding)         #000000 (a=0)
row1 bottom edge (y = last in-row)    #EEEEEE (a=255)
row1 bottom + 1  (in margin gap)      #000000 (a=0)
row1 bottom + 3  (deeper into gap)    #000000 (a=0)
row1 left edge   (x = first in-row)   #EEEEEE (a=255)
row1 left - 1    (in padding)         #000000 (a=0)
```

Every in-row pixel is exactly `#EEEEEE` opaque; every pixel outside
the row is `alpha = 0` (transparent). All three hypotheses (default
elevation, edge antialiasing, theme drawable) are ruled out — there is
no outline. What looked like a stroke + rounded corners in the PNG was
the alpha-0 strip between the row and the next row, perceived as a
soft edge once the image viewer composited the transparent area
against its own page background.

### Real gap, and fix

The renderer was painting only the view tree, leaving the rest of the
canvas transparent. A real device shows the window's
`?attr/windowBackground` (white by default) under and around the view
tree, so PNGs that aim to match real-device output need to do the
same.

Fix (`renderer/src/main/kotlin/.../SnapshotRenderer.kt`):

```kotlin
val bitmap = Bitmap.createBitmap(...)
val canvas = Canvas(bitmap)
canvas.drawColor(windowBackgroundColor)   // ← new — defaults to WHITE
rootView.draw(canvas)
```

`windowBackgroundColor` is a constructor parameter on `SnapshotRenderer`
defaulting to `Color.WHITE`, leaving a seam to wire a real theme/
configuration in later.

Re-records the Phase 2 goldens: every transparent area in the prior
PNGs becomes `#FFFFFF`. Visible diff per fixture:

- `simpleView.png` — background outside the indigo rect goes white.
- `nestedViews.png` — outside the outer `#F5F5F5` card goes white.
  Inside is unchanged (already opaque).
- `textAndImage.png` — outside the white card it's already white, no
  visible change; the bottom edge that used to look like a stroke goes
  flush with the surrounding white.
- `scrollView.png` — `marginBottom` gaps between rows fill with white;
  the rows themselves are unchanged.
- `conditional.png` — area outside the white card goes white; the
  bottom edge that used to look stroked goes flush.

### Followups (out of scope here)

- Drive `windowBackgroundColor` from the active theme / `uiMode`
  instead of hard-coding white. Belongs with §5 (transforms / shadows /
  theming).
- Pixel-perfect shadow / elevation support for views that *do* request
  it. Also §5.

## 2. Nested text styling

`RCTParagraph` currently collapses all descendant `RCTRawText` nodes
into a single concatenated string and assigns one font size / weight /
colour from the paragraph's own style. Real RN renders nested `<Text>`
with weight spans, colour runs, and font-family-per-span via
`SpannableStringBuilder`.

**Work:** in `FabricViewBuilder.buildTextView`, walk the descendants
and build spans (`StyleSpan`, `ForegroundColorSpan`, `TypefaceSpan`,
`AbsoluteSizeSpan`) instead of flattening. Adjust
`LayoutlibTextMeasurer` to measure the same spanned text so Yoga and
the painter agree.

**Touches:** all text goldens. Re-record after.

## 3. Image loading

`RCTImageView` paints a grey rect at the computed bounds. A real device
loads `source.uri`, decodes it, scales via `resizeMode`, applies
`tintColor`.

**Work:**
- Resolve `source.uri` against a configured base path (file URIs first,
  HTTP later — snapshot tests should not hit the network by default).
- Decode with `BitmapFactory.decodeFile` / `decodeByteArray`.
- Honour `resizeMode` (`cover`, `contain`, `stretch`, `center`,
  `repeat`).
- Stub uri schemes the fixture doesn't bundle (e.g. `https://`) with
  an explicit placeholder so the failure mode is loud.

**Touches:** every fixture with an `RCTImageView`. Re-record after.

## 4. Update path (`cloneNodeWithNewProps` and friends)

Phase 1 fixtures all complete in a single synchronous commit. The
Fabric mount-instruction stream supports update operations
(`cloneNode`, `cloneNodeWithNewProps`, `cloneNodeWithNewChildren`, etc.)
that the translator currently ignores. A real app's stream interleaves
these freely.

**Work:**
- Capture a fixture that triggers `setState` between mount and commit
  (or a concurrent root render).
- Teach `FabricViewBuilder` to apply update ops to the in-progress tree
  before measure/layout/draw.

## 5. transform / opacity / shadows

Currently read off `style` and dropped. Map them:
- `transform: [{translateX, scale, rotate, ...}]` → `View.translationX`,
  `View.scaleX`, `View.rotation`, etc.
- `opacity` → `View.alpha`.
- `shadowColor` / `shadowOffset` / `shadowOpacity` / `shadowRadius`
  (iOS-ish) and `elevation` (Android) — set `view.elevation` and
  override `view.outlineProvider` when we need a non-rect outline.
  This sits next to the §1 investigation; do them in the same change.

## 6. RTL

`YogaLayoutEngine` hard-codes `DIRECTION_LTR` on the root. Add an RTL
fixture (mirrored row, `start`/`end` margins) and expose `direction` as
a surface option that flows through to Yoga's
`YogaConfig.setLayoutDirection` and to the `TextView`'s
`layoutDirection`.

## 7. Custom font loading

Today the renderer uses only the fonts layoutlib bundles — Roboto plus
the Noto fallbacks indexed by `Bridge.init(systemProps, fontsDir, …)` in
`LayoutlibBootstrap`. `LayoutlibTextMeasurer` always sets
`paint.typeface = Typeface.create(Typeface.DEFAULT, weight)` and never
consults `fontFamily`; `FabricViewBuilder.buildTextView` silently drops
`fontFamily`; `ParagraphTextBuilder.SpanStyle` parses it into a dead
field. A `<Text style={{ fontFamily: "Inter" }}>` renders as Roboto
with no warning.

To make app-shipped fonts work:

1. **Registration API on `SnapshotRenderer`** — `register(name: String,
   ttf: File)` that calls `Typeface.createFromFile(ttf)` and stashes it
   in a `Map<String, Typeface>`. Take the registry as a constructor
   parameter so callers can pre-build it.
2. **Thread the registry into `LayoutlibTextMeasurer`** — look up the
   paragraph's `fontFamily` and call `Typeface.create(custom, weight)`
   instead of `DEFAULT`. Falls back to `DEFAULT` when the family is
   absent so missing-asset diagnostics stay loud (log + use default).
3. **`TypefaceSpan` in `ParagraphTextBuilder.applySpans`** for nested
   `RCTText` runs that override `fontFamily`. Wire `applySpans` against
   the same registry rather than the global `TypefaceSpan(name)`
   constructor, which only looks up *system* families.
4. **Paragraph-level `fontFamily` on the base `TextView`** in
   `buildTextView`.
5. **Asset-pipeline integration.** RN apps ship `.ttf` under
   `android/app/src/main/assets/fonts/` and reference them by the
   `PostScript` name (or basename, depending on configuration). A
   pragmatic v1: the renderer accepts a directory, registers every
   `.ttf` under it keyed by `file.nameWithoutExtension`, and the test
   harness points at the app's fonts directory. Phase 3's native-module
   audit will need to handle the full RN asset story (multi-weight
   families, the `react-native.config.js` mappings, etc.).

Touches every text golden once it lands. Re-record after.

