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

## 2. Nested text styling (resolved)

`RCTParagraph` originally collapsed all descendant `RCTRawText` nodes
into a single concatenated string and assigned one font size / weight /
colour from the paragraph's own style. Real RN renders nested `<Text>`
with weight spans, colour runs, and per-span sizing via
`SpannableStringBuilder`.

### Outcome

`ParagraphTextBuilder` walks the `RCTParagraph` subtree and produces a
`SpannableStringBuilder` with `AbsoluteSizeSpan` / `ForegroundColorSpan`
/ `StyleSpan` per `RCTText` run. Both `FabricViewBuilder.buildTextView`
and the Yoga text measurer go through it, so layout and draw agree
on what's being rendered. Inherited styles cascade through nested
`RCTText` via `SpanStyle.mergedWith(...)`.

Covered: `fontSize`, `color`, `fontWeight` (bold via `StyleSpan`),
`fontStyle: italic`. Not covered yet: per-span `fontFamily` (depends
on §7 custom font registry).

Fixture: `nestedTextSpans` — bold "Wes", bold magenta "3 new",
smaller grey "1 reminder" against a black base style.

## 3. Image loading (partially resolved)

### Done

- `source.uri` decoding for `data:image/*;base64,…` (via
  `BitmapFactory.decodeByteArray`) and `file://` (via `decodeFile`).
- Five `resizeMode` cases mapped to `ImageView.ScaleType` (`cover`,
  `contain`, `stretch`, `center`; `repeat` falls back to `tile` via
  `BitmapShader` — verify against device).
- `tintColor` applied via `PorterDuffColorFilter(color, SRC_IN)` so
  every opaque pixel of the source collapses to the tint colour while
  alpha is preserved. Matches RN Android's behaviour for solid tints.
- Metro-shaped source objects (`{ uri, width, height, scale,
  __packager_asset: true }`) decode cleanly — `decodeImage` only reads
  `source.uri`, the extra fields are tolerated silently. The actual
  Metro `require('./foo.png')` → `file://` resolution lands in Phase
  3's `AssetRegistry` capture-time hook; the renderer-side contract is
  already in place.
- Unsupported schemes (today: `http(s)://`, plus `asset://` until the
  Phase 3 hook ships) render the loud grey placeholder instead of
  failing the build.
- Fixtures: `imageResizeModes` (four resize modes) and
  `imageTintAndAsset` (control + three `tintColor` variants against a
  Metro-shaped source).

### Open for real-app integration

- **HTTP source caching.** Out of scope for snapshot tests — fixtures
  should pin assets locally.
- **Multi-stop colour matrix tints.** RN's `tintColor` only takes a
  single colour. If a future feature wants gradient tints or
  preserve-luminance modes we'll switch from `PorterDuffColorFilter` to
  `ColorMatrixColorFilter`.

## 4. Update path (resolved)

Phase 1 fixtures originally completed in a single synchronous commit;
the Fabric stream's `clone*` ops were ignored. Now wired:

- `rn-harness/src/renderFixture.ts` exports `renderFrames(elements)`
  that drives N sequential `ReactFabric.render` calls into the same
  surface. Frame ≥ 2 reconciles against frame 1, so Fabric emits the
  `clone*` / `appendChild` update ops.
- `captureFixtures` and `mount-instructions.test` treat an array
  default export as a multi-frame spec.
- `YogaLayoutEngine.cloneNode` and `FabricViewBuilder.cloneInto` apply
  `cloneNode` / `cloneNodeWithNewProps` /
  `cloneNodeWithNewChildren{,AndProps}` against the in-flight tree.
  Props shallow-merge (`JsonNull` → key removal, matching the capture
  stub's `diffAttributePayloads`); children either copy from source or
  reset to empty. Last `completeRoot` wins.

Fixture: `updateBadgeCount` — two-frame inbox card transitioning grey
"0 unread" → magenta "3 unread".

Still open: a fixture that spans multiple `completeRoot` calls without
explicit `renderFrames` — i.e. a concurrent / Suspense-driven update
where Fabric itself decides to split the commit. Phase 1 stream still
assumes synchronous commits inside each `render()` call.

## 5. transform / opacity / shadows (resolved)

### Outcome

- `applyTransform` reads `style.transform: [{translateX, translateY,
  scale, scaleX, scaleY, rotate, rotateZ}, …]` → `View.translationX/Y`,
  `View.scaleX/Y`, `View.rotation`. Accepts `"Xdeg"`, `"Xrad"`, or
  numeric for rotate.
- `applyOpacity`: `style.opacity` → `View.alpha`, clamped to `[0, 1]`.
- `applyBoxShadow`: `style.boxShadow: [{offsetX, offsetY, blurRadius,
  spreadDistance, color}, …]` (RN's modern cross-platform prop, RN ≥
  0.76) → `ShadowProxyDrawable` installed on each shadowed view's
  parent. The drawable paints the parent's original background, then
  each child's shadow at the child's local position, then the parent
  dispatches draws on top. Falloff approximated with concentric
  expanded rects (layoutlib's software canvas has no `BlurMaskFilter`).
  Ancestors get `clipChildren = false` so the shadow extends past the
  parent. `parseColor` accepts `rgba(r,g,b,a)` for shadow colours.

Fixture: `transformsAndEffects` — one labeled row per effect with a
reference box beside the affected one.

### Deferred

- `rotateX` / `rotateY` / `skew*` — need a `Camera` matrix.
- iOS-style `shadowColor` / `shadowOffset` / `shadowOpacity` /
  `shadowRadius` — RN's docs now point to `boxShadow` as the
  cross-platform replacement, so deferring until a fixture actually
  needs them.
- CSS-string form of `boxShadow` (`"0 4px 12px rgba(0,0,0,.35)"`) — the
  array form is the canonical RN serialization.
- `inset` shadows — need a clip + invert draw strategy.
- `View.elevation` (legacy Android-only) — layoutlib's software canvas
  doesn't render platform shadows. Not bridging this; users should
  migrate to `boxShadow`.

## 6. RTL

`YogaLayoutEngine` hard-codes `DIRECTION_LTR` on the root. Add an RTL
fixture (mirrored row, `start`/`end` margins) and expose `direction` as
a surface option that flows through to Yoga's
`YogaConfig.setLayoutDirection` and to the `TextView`'s
`layoutDirection`.

## 7. Custom font loading (resolved)

### Outcome

`FontRegistry` (`renderer/src/main/kotlin/.../FontRegistry.kt`) maps
`fontFamily` strings to loaded `Typeface`s. Construct one, call
`register(family, typeface)` or `registerFile(family, ttfFile)` per
app font, and hand it to `SnapshotRenderer` via the constructor:

```kotlin
val fonts = FontRegistry()
    .registerFile("Inter", File("…/Inter-Regular.ttf"))
    .registerFile("InterBold", File("…/Inter-Bold.ttf"))
SnapshotRenderer(bootstrap, fontRegistry = fonts)
```

Lookup order in `FontRegistry.resolve(family, weight)`:
1. Custom registrations.
2. Built-in family names handled by `Typeface.create` (`"sans-serif"`,
   `"serif"`, `"monospace"`).
3. `Typeface.DEFAULT` with the requested weight, plus a one-line stderr
   warning per missing family (deduped) so silent fallbacks stay
   visible.

Where the registry is consulted:
- `LayoutlibTextMeasurer.measure` — uses `resolve(fontFamily, weight)`
  for the paragraph's base typeface so Yoga measurement matches what
  the painter draws.
- `FabricViewBuilder.buildTextView` — sets `tv.typeface` from the
  registry (paragraph-level `fontFamily` + `fontWeight`).
- `ParagraphTextBuilder.applySpans` — emits `TypefaceSpan(typeface)`
  (the API-28 Typeface-overload) for any nested `RCTText` whose
  `fontFamily` is a custom registration. System families and the
  no-`fontFamily` case stay on the paragraph base + `StyleSpan` for
  bold/italic.

The CLI grew a `--fonts <dir>` flag that registers every `.ttf` / `.otf`
under the directory keyed by `file.nameWithoutExtension`. RN apps ship
their fonts under `android/app/src/main/assets/fonts/` so passing that
directory is the v1 integration path.

Fixture: `customFontText` registers `TestMono` →
`renderer/src/test/resources/fonts/LiberationMono-Regular.ttf` (SIL OFL
1.1, license bundled alongside) and demonstrates paragraph-level,
per-span, weighted, and missing-family rendering — the last row
visibly falls back to Roboto.

### Deferred

- The `react-native.config.js` family-name mapping. Phase 3's first
  integration with a real app will need a small loader that
  understands the project's font declarations (PostScript names,
  multi-weight families). For now callers pre-build the registry.
- Per-weight TTF files. `Typeface.create(base, BOLD)` synthesises bold
  glyphs from the registered face — visually fine for sans-serif but
  fuzzy for display fonts shipped as separate weight files.

