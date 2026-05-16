# Phase 2.5 — fidelity on top of Phase 2

Phase 2 lands a working layoutlib renderer end-to-end (Yoga JNI +
`Bridge.init` + Fabric translator + golden PNG tests on CI). Phase 2.5
closes the gap between *structurally correct* and *visually matches a
device*. Items are roughly ordered by how disruptive they are to the
existing goldens — fixing the outline anomaly first is cheap; image
loading and text spans will shift many goldens at once.

## 1. ScrollView row outline anomaly (investigation)

### Symptom

In `renderer/src/test/snapshots/scrollView.png` each `RCTView` row
appears to have a 1 px outline and possibly soft corners, even though
the fixture only sets `backgroundColor` + `height` + `marginBottom`.
The same faint edge is visible at the bottom of the outer container in
`conditional.png` and `textAndImage.png`. No fixture sets `borderWidth`,
`borderColor`, `borderRadius`, or `elevation`.

### Why this matters

`FabricViewBuilder.applyCommonProps` (renderer/src/main/kotlin/.../FabricViewBuilder.kt:185)
takes the fast path `view.setBackgroundColor(color)` whenever there is
no border/corner/border-radius prop. That should produce a plain
`ColorDrawable` and nothing more. The visible artifact means something
other than the fixture is influencing the render — probably layoutlib's
default platform theme or our own bootstrap. Until we understand it,
every solid-fill view in every snapshot carries a phantom border that
won't match real-device output.

### Hypotheses

- **A. Default elevation.** Layoutlib's platform theme assigns a
  non-zero `view.elevation` to `FrameLayout` (or to the `decorView`).
  `ViewOutlineProvider.BACKGROUND` then queries `ColorDrawable.getOutline`
  and renders a faint shadow. **Predicts:** edge pixels are
  background-blended with a darker tint, extending 1–2 px beyond the
  row's geometric bounds.
- **B. Edge antialiasing.** No outline at all — the rendered row is a
  pixel-aligned rectangle, and what we perceive as a stroke is just
  AA blending where the row's gray meets the white parent. **Predicts:**
  interior pixels are exactly the fixture's `backgroundColor`, edge
  pixels are a clean blend of bg ↔ white, no extension beyond bounds.
- **C. Theme-applied drawable.** `StubLayoutlibCallback` /
  `ResourceResolverStub` happen to resolve a non-trivial
  `?attr/colorBackground` or `?attr/selectableItemBackground` that wraps
  our `ColorDrawable` in an `InsetDrawable` or
  `RippleDrawable`. **Predicts:** the artifact has structure (insets,
  press masks) inconsistent with a pure shadow or AA.

### Experiments to run, in order

1. **Capture pixel samples.** `ScrollViewOutlineInvestigationTest`
   (Ignored by default) samples 7 points around row 1 of the scrollView
   fixture and prints their RGB values. Un-ignore, run, read the test
   stdout in the surefire report. The shape of the values rules in/out
   each hypothesis above.
2. **Force `elevation = 0f` + `outlineProvider = NONE`.** In
   `FabricViewBuilder.buildFrameLayout`, after constructing the
   `FrameLayout`, set both. If the artifact disappears in a fresh
   recording, hypothesis A is the answer and the fix is to bake those
   defaults into the builder.
3. **Render with no theme.** `SessionParams` currently uses the default
   theme implied by layoutlib. Try passing
   `sessionParams.setRtlSupport(false)` + an explicit
   `Configuration.Theme_DeviceDefault_Light_NoActionBar` (or a custom
   minimal theme) and see whether the artifact moves or disappears.
   Confirms or rules out hypothesis C.

Whichever experiment removes the artifact, the fix is committed and
goldens are re-recorded via the `phase-2-renderer` workflow's
`record=true` dispatch.

### Out of scope

- Pixel-perfect shadow / elevation **support** for views that *do*
  want it. That is a separate Phase 2.5 item (see §5).

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
