package com.example.renderer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.ScrollView
import android.widget.TextView
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import java.io.File
import java.util.Base64

/**
 * Builds an Android View tree from Fabric mount instructions + Yoga layout rects.
 *
 * Port of `snapshots/.../FabricTranslator.kt`, adapted to work with layoutlib
 * directly (no Paparazzi). Takes [YogaLayoutEngine.LayoutResult] instead of
 * a separate layout JSON file.
 */
class FabricViewBuilder(
    private val context: Context,
    private val density: Float,
    private val fontRegistry: FontRegistry = FontRegistry.EMPTY,
) {

    private data class NodeSpec(
        val nodeId: Int,
        val viewName: String,
        val props: JsonObject,
        val children: MutableList<Int> = mutableListOf(),
    )

    fun build(instructionsJson: String, layoutResult: YogaLayoutEngine.LayoutResult): View {
        val root = JsonParser.parseString(instructionsJson).asJsonObject
        return build(root, layoutResult)
    }

    fun build(instructions: JsonObject, layoutResult: YogaLayoutEngine.LayoutResult): View {
        val nodes = mutableMapOf<Int, NodeSpec>()
        var rootNodeId: Int = -1

        val ops = instructions.getAsJsonArray("instructions")
        for (opEl in ops) {
            val op = opEl.asJsonObject
            when (op.get("op").asString) {
                "createNode" -> {
                    val id = op.get("nodeId").asInt
                    val viewName = op.get("viewName").asString
                    val props = if (op.has("props") && op.get("props").isJsonObject)
                        op.getAsJsonObject("props") else JsonObject()
                    nodes[id] = NodeSpec(id, viewName, props)
                }
                "cloneNode" -> cloneInto(op, nodes, keepChildren = true, newProps = null)
                "cloneNodeWithNewProps" -> cloneInto(op, nodes,
                    keepChildren = true,
                    newProps = op.get("newProps")?.takeIf { it.isJsonObject }?.asJsonObject)
                "cloneNodeWithNewChildren" -> cloneInto(op, nodes,
                    keepChildren = false, newProps = null)
                "cloneNodeWithNewChildrenAndProps" -> cloneInto(op, nodes,
                    keepChildren = false,
                    newProps = op.get("newProps")?.takeIf { it.isJsonObject }?.asJsonObject)
                "appendChild" -> {
                    val parent = nodes[op.get("parentNodeId").asInt]
                        ?: error("appendChild parent ${op.get("parentNodeId")} not found")
                    parent.children.add(op.get("childNodeId").asInt)
                }
                "appendChildToSet" -> {
                    // Last child appended to a set is the root that the
                    // following completeRoot publishes. Across multi-frame
                    // streams (update path) the last completeRoot wins.
                    rootNodeId = op.get("childNodeId").asInt
                }
                "createChildSet", "completeRoot", "registerEventHandler" -> {}
                else -> {}
            }
        }

        require(rootNodeId != -1) {
            "No root node — instruction stream never emitted appendChildToSet/completeRoot"
        }

        val rects = layoutResult.rects
        val rootRect = rects[rootNodeId]
            ?: error("No layout rect for root node $rootNodeId")

        val rootView = buildView(nodes.getValue(rootNodeId), nodes, rects)
        rootView.layoutParams = FrameLayout.LayoutParams(
            dp(rootRect.width), dp(rootRect.height)
        )
        installShadowDrawables()
        return rootView
    }

    /**
     * Hand registered box-shadow specs to a [ShadowProxyDrawable] on each
     * shadowed view's parent. Run after the tree is fully assembled (so
     * `view.parent` is set), but before measure/layout (the drawable
     * reads child positions lazily at draw time).
     *
     * Also clears `clipChildren` on every ancestor of a shadowed view —
     * Android-side, parent ViewGroups clip child draws to their own
     * bounds by default, which would chop off any shadow extending past
     * the parent. RN core does the same on Android when boxShadow is set.
     */
    private fun installShadowDrawables() {
        if (boxShadows.isEmpty()) return
        val byParent: MutableMap<ViewGroup, MutableList<Pair<View, List<BoxShadowSpec>>>> =
            mutableMapOf()
        for ((view, specs) in boxShadows) {
            val parent = view.parent as? ViewGroup ?: continue
            byParent.getOrPut(parent) { mutableListOf() }.add(view to specs)
            var ancestor: android.view.ViewParent? = parent
            while (ancestor is ViewGroup) {
                ancestor.clipChildren = false
                ancestor = ancestor.parent
            }
        }
        for ((parent, list) in byParent) {
            parent.background = ShadowProxyDrawable(
                inner = parent.background,
                children = list,
                density = density,
            )
        }
    }

    /**
     * Materialise a `clone*` instruction. Mirror of the logic in
     * `YogaLayoutEngine.cloneNode`; the two engines reconstruct trees
     * independently so this is intentionally duplicated.
     */
    private fun cloneInto(
        op: JsonObject,
        nodes: MutableMap<Int, NodeSpec>,
        keepChildren: Boolean,
        newProps: JsonObject?,
    ) {
        val id = op.get("nodeId").asInt
        val sourceId = op.get("sourceNodeId").asInt
        val source = nodes[sourceId] ?: return
        val mergedProps = mergeProps(source.props, newProps)
        val children: MutableList<Int> =
            if (keepChildren) source.children.toMutableList() else mutableListOf()
        nodes[id] = NodeSpec(id, source.viewName, mergedProps, children)
    }

    private fun mergeProps(base: JsonObject, diff: JsonObject?): JsonObject {
        if (diff == null) return base
        val merged = base.deepCopy()
        for ((key, value) in diff.entrySet()) {
            if (value.isJsonNull) merged.remove(key)
            else merged.add(key, value)
        }
        return merged
    }

    private fun buildView(
        node: NodeSpec,
        all: Map<Int, NodeSpec>,
        rects: Map<Int, YogaLayoutEngine.LayoutRect>,
    ): View {
        return when (node.viewName) {
            "RCTView", "RCTScrollContentView" -> buildFrameLayout(node, all, rects)
            "RCTScrollView" -> buildScrollView(node, all, rects)
            "RCTImageView" -> buildImageView(node)
            // Two paragraph-level host names: RCTParagraph is what the
            // host-element DSL emits; RCTText is what real RN's
            // TextNativeComponent lowers `<Text>` to. Both map to the
            // same TextView path.
            "RCTParagraph", "RCTText" -> buildTextView(node, all)
            "RCTRawText" -> error("RCTRawText should be consumed by parent paragraph")
            // RCTVirtualText is real RN's nested-span name; it's
            // consumed by ParagraphTextBuilder via the parent paragraph.
            "RCTVirtualText" -> error("RCTVirtualText should be consumed by parent paragraph as a span")
            else -> buildFrameLayout(node, all, rects)
        }
    }

    private fun buildFrameLayout(
        node: NodeSpec,
        all: Map<Int, NodeSpec>,
        rects: Map<Int, YogaLayoutEngine.LayoutRect>,
    ): FrameLayout {
        val group = FrameLayout(context)
        applyCommonProps(group, node.props)
        for (childId in node.children) {
            val child = all[childId] ?: continue
            // Text leaves only live inside paragraphs; defensive skip
            // for any that slip through (consumed by RCTParagraph/RCTText
            // via ParagraphTextBuilder, never built as standalone views).
            if (child.viewName == "RCTRawText" || child.viewName == "RCTVirtualText") continue
            val childRect = rects[childId] ?: continue
            val childView = buildView(child, all, rects)
            val lp = FrameLayout.LayoutParams(dp(childRect.width), dp(childRect.height))
            lp.leftMargin = dp(childRect.left)
            lp.topMargin = dp(childRect.top)
            group.addView(childView, lp)
        }
        return group
    }

    private fun buildScrollView(
        node: NodeSpec,
        all: Map<Int, NodeSpec>,
        rects: Map<Int, YogaLayoutEngine.LayoutRect>,
    ): ScrollView {
        val scroll = ScrollView(context)
        applyCommonProps(scroll, node.props)
        val contentId = node.children.firstOrNull() ?: return scroll
        val content = all[contentId] ?: return scroll
        val contentRect = rects[contentId] ?: return scroll
        val contentView = buildView(content, all, rects)
        scroll.addView(contentView, FrameLayout.LayoutParams(
            dp(contentRect.width), dp(contentRect.height)
        ))
        return scroll
    }

    private fun buildImageView(node: NodeSpec): ImageView {
        val image = ImageView(context)
        applyCommonProps(image, node.props)

        val bitmap = decodeImage(node.props)
        if (bitmap != null) {
            image.setImageBitmap(bitmap)
            image.scaleType = resolveScaleType(
                node.props.get("resizeMode")?.takeIf { it.isJsonPrimitive }?.asString
            )
            applyTintColor(image, node.props)
        } else if (image.background == null) {
            // Unsupported scheme or decode failure — render the legacy grey
            // placeholder so the slot is still visible. http(s):// URIs land
            // here today; a future fetcher hook can plug them in.
            image.setBackgroundColor(Color.parseColor("#CFD8DC"))
        }
        return image
    }

    private fun applyTintColor(image: ImageView, props: JsonObject) {
        val raw = props.get("tintColor")
            ?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }?.asString ?: return
        val color = parseColor(raw)
        // SRC_IN with a solid colour replaces every opaque pixel of the
        // bitmap with the tint colour, preserving the source's alpha
        // channel — same behaviour RN Android wires for tintColor via
        // its custom ImageDrawable.
        image.colorFilter = android.graphics.PorterDuffColorFilter(
            color, android.graphics.PorterDuff.Mode.SRC_IN,
        )
    }

    private fun decodeImage(props: JsonObject): Bitmap? {
        // Real RN normalises `source` to an array for multi-source
        // responsive support — picks the best entry at native render
        // time based on display scale. For a headless single-pass
        // render the first object entry is good enough. The DSL keeps
        // emitting `source` as a plain object; both shapes flow
        // through here.
        val raw = props.get("source") ?: return null
        val source = when {
            raw.isJsonObject -> raw.asJsonObject
            raw.isJsonArray -> {
                var first: JsonObject? = null
                for (entry in raw.asJsonArray) {
                    if (entry.isJsonObject) { first = entry.asJsonObject; break }
                }
                first ?: return null
            }
            else -> return null
        }
        val uri = source.get("uri")
            ?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }
            ?.asString ?: return null
        return when {
            uri.startsWith("data:image/") -> decodeDataUri(uri)
            uri.startsWith("file://") -> decodeFile(uri.removePrefix("file://"))
            else -> null
        }
    }

    private fun decodeDataUri(uri: String): Bitmap? {
        val commaIdx = uri.indexOf(',')
        if (commaIdx < 0) return null
        val header = uri.substring(0, commaIdx)
        if (!header.contains(";base64")) return null
        val bytes = try {
            Base64.getDecoder().decode(uri.substring(commaIdx + 1))
        } catch (_: IllegalArgumentException) {
            return null
        }
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }

    private fun decodeFile(path: String): Bitmap? {
        val f = File(path)
        if (!f.isFile) return null
        return BitmapFactory.decodeFile(f.absolutePath)
    }

    private fun resolveScaleType(resizeMode: String?): ImageView.ScaleType =
        when (resizeMode) {
            "cover" -> ImageView.ScaleType.CENTER_CROP
            "contain" -> ImageView.ScaleType.FIT_CENTER
            "stretch" -> ImageView.ScaleType.FIT_XY
            "center" -> ImageView.ScaleType.CENTER
            // RN's "repeat" needs a BitmapShader / TileMode.REPEAT setup;
            // falls back to cover until we wire that. Logged as a 2.5
            // follow-up.
            "repeat" -> ImageView.ScaleType.CENTER_CROP
            // RN's default for <Image> is "cover".
            else -> ImageView.ScaleType.CENTER_CROP
        }

    private fun buildTextView(node: NodeSpec, all: Map<Int, NodeSpec>): TextView {
        val tv = TextView(context)
        applyCommonProps(tv, node.props)

        // Always build a SpannableStringBuilder — for paragraphs without
        // nested RCTText runs it's equivalent to a plain String (no spans),
        // but using the same path everywhere keeps the measurer and the view
        // in sync on which text they're rendering.
        tv.text = ParagraphTextBuilder.build(
            paragraphChildIds = node.children,
            density = density,
            fontRegistry = fontRegistry,
            viewNameOf = { id -> all[id]?.viewName },
            propsOf = { id -> all[id]?.props },
            childrenOf = { id -> all[id]?.children ?: emptyList() },
        )

        // Paragraph base style lives on the TextView itself; spans on the
        // CharSequence above are deltas for nested RCTText runs.
        val style = styleObject(node.props)
        // Resolve the base typeface (custom font + weight). Always set this
        // so the paragraph picks up the registered family even when there's
        // no fontWeight on the style.
        val baseWeight = paragraphWeight(style)
        val baseFamily = style?.get("fontFamily")
            ?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }?.asString
        tv.typeface = fontRegistry.resolve(baseFamily, baseWeight)
        style?.let { s ->
            if (s.has("fontSize")) tv.textSize = s.get("fontSize").asFloat
            if (s.has("color")) tv.setTextColor(parseColor(s.get("color").asString))
        }
        return tv
    }

    private fun paragraphWeight(style: JsonObject?): Int {
        val w = style?.get("fontWeight")
            ?.takeIf { it.isJsonPrimitive }?.asString ?: return Typeface.NORMAL
        return if (w == "bold" || (w.toIntOrNull()?.let { it >= 600 } == true)) {
            Typeface.BOLD
        } else {
            Typeface.NORMAL
        }
    }

    // --- Common prop application ---

    private fun applyCommonProps(view: View, props: JsonObject) {
        val style = styleObject(props) ?: return
        applyBackground(view, style)
        applyOpacity(view, style)
        applyTransform(view, style)
        applyBoxShadow(view, style)
    }

    private fun applyBackground(view: View, style: JsonObject) {
        val hasCornerProp = CORNER_RADIUS_KEYS.any { style.has(it) }
        val hasBorder = style.has("borderWidth") || style.has("borderColor")
        val hasBackground = style.has("backgroundColor")

        if (!hasCornerProp && !hasBorder && hasBackground) {
            view.setBackgroundColor(parseColor(style.get("backgroundColor").asString))
            return
        }

        if (hasCornerProp || hasBorder || hasBackground) {
            val drawable = GradientDrawable()
            drawable.shape = GradientDrawable.RECTANGLE
            if (hasBackground) {
                drawable.setColor(parseColor(style.get("backgroundColor").asString))
            }
            applyCornerRadii(drawable, style)
            applyBorder(drawable, style)
            view.background = drawable
        }
    }

    private fun applyOpacity(view: View, style: JsonObject) {
        val opacity = style.get("opacity")
            ?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isNumber }
            ?.asFloat ?: return
        view.alpha = opacity.coerceIn(0f, 1f)
    }

    private fun applyTransform(view: View, style: JsonObject) {
        val transform = style.get("transform")?.takeIf { it.isJsonArray }?.asJsonArray ?: return
        var tx = 0f
        var ty = 0f
        var sx = 1f
        var sy = 1f
        var rotation = 0f
        for (entry in transform) {
            if (!entry.isJsonObject) continue
            for ((key, value) in entry.asJsonObject.entrySet()) {
                if (!value.isJsonPrimitive) continue
                val prim = value.asJsonPrimitive
                when (key) {
                    "translateX" -> if (prim.isNumber) tx += prim.asFloat
                    "translateY" -> if (prim.isNumber) ty += prim.asFloat
                    "scale" -> if (prim.isNumber) {
                        sx *= prim.asFloat
                        sy *= prim.asFloat
                    }
                    "scaleX" -> if (prim.isNumber) sx *= prim.asFloat
                    "scaleY" -> if (prim.isNumber) sy *= prim.asFloat
                    "rotate", "rotateZ" -> parseAngleDegrees(prim)?.let { rotation += it }
                    // rotateX / rotateY / skewX / skewY exist in RN but
                    // need a Camera matrix. Out of scope for the v1 prop
                    // mapping; logged as a 2.5 follow-up.
                }
            }
        }
        if (tx != 0f) view.translationX = dpF(tx)
        if (ty != 0f) view.translationY = dpF(ty)
        if (sx != 1f) view.scaleX = sx
        if (sy != 1f) view.scaleY = sy
        if (rotation != 0f) view.rotation = rotation
    }

    private fun parseAngleDegrees(prim: com.google.gson.JsonPrimitive): Float? {
        if (prim.isNumber) return prim.asFloat
        if (!prim.isString) return null
        val s = prim.asString.trim()
        return when {
            s.endsWith("deg") -> s.dropLast(3).toFloatOrNull()
            s.endsWith("rad") -> s.dropLast(3).toFloatOrNull()
                ?.let { Math.toDegrees(it.toDouble()).toFloat() }
            else -> s.toFloatOrNull()
        }
    }

    private fun applyBoxShadow(view: View, style: JsonObject) {
        // RN's modern cross-platform shadow prop. Accepts an array of
        //   { offsetX, offsetY, blurRadius, spreadDistance, color, inset }
        // descriptors (and a CSS string form which we don't parse yet).
        // We deliberately don't touch `View.elevation` — layoutlib's
        // software canvas doesn't render the platform shadow, and box-shadow
        // is the supported style going forward (RN ≥ 0.76).
        val shadows = parseBoxShadow(style) ?: return
        if (shadows.isEmpty()) return
        boxShadows[view] = shadows
    }

    /** Per-view shadow specs registered during build; consumed by
     *  [SnapshotRenderer]'s shadow pre-pass. */
    val boxShadows: MutableMap<View, List<BoxShadowSpec>> = mutableMapOf()

    private fun parseBoxShadow(style: JsonObject): List<BoxShadowSpec>? {
        val raw = style.get("boxShadow") ?: return null
        if (!raw.isJsonArray) return null  // CSS string form not yet supported
        val out = mutableListOf<BoxShadowSpec>()
        for (entry in raw.asJsonArray) {
            if (!entry.isJsonObject) continue
            val obj = entry.asJsonObject
            // Skip inset shadows for now — they paint *inside* the view
            // rect and need a different draw strategy (clip + invert).
            val inset = obj.get("inset")?.takeIf { it.isJsonPrimitive }?.asBoolean ?: false
            if (inset) continue
            out.add(
                BoxShadowSpec(
                    offsetX = floatProp(obj, "offsetX") ?: 0f,
                    offsetY = floatProp(obj, "offsetY") ?: 0f,
                    blurRadius = floatProp(obj, "blurRadius") ?: 0f,
                    spreadDistance = floatProp(obj, "spreadDistance") ?: 0f,
                    color = obj.get("color")
                        ?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }
                        ?.asString?.let { parseColor(it) } ?: Color.BLACK,
                ),
            )
        }
        return if (out.isEmpty()) null else out
    }

    private fun floatProp(obj: JsonObject, key: String): Float? =
        obj.get(key)?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isNumber }?.asFloat

    private fun applyCornerRadii(drawable: GradientDrawable, style: JsonObject) {
        val uniform = style.get("borderRadius")
            ?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isNumber }?.asFloat
        val tl = cornerValue(style, "TopLeft", "TopStart", uniform)
        val tr = cornerValue(style, "TopRight", "TopEnd", uniform)
        val br = cornerValue(style, "BottomRight", "BottomEnd", uniform)
        val bl = cornerValue(style, "BottomLeft", "BottomStart", uniform)
        if (tl == null && tr == null && br == null && bl == null) return
        val tlPx = dpF(tl ?: 0f)
        val trPx = dpF(tr ?: 0f)
        val brPx = dpF(br ?: 0f)
        val blPx = dpF(bl ?: 0f)
        drawable.cornerRadii = floatArrayOf(
            tlPx, tlPx, trPx, trPx, brPx, brPx, blPx, blPx,
        )
    }

    private fun cornerValue(
        style: JsonObject, ltrSuffix: String, logicalSuffix: String, fallback: Float?,
    ): Float? {
        style.get("border${ltrSuffix}Radius")
            ?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isNumber }
            ?.let { return it.asFloat }
        style.get("border${logicalSuffix}Radius")
            ?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isNumber }
            ?.let { return it.asFloat }
        return fallback
    }

    private fun applyBorder(drawable: GradientDrawable, style: JsonObject) {
        val widthRaw = style.get("borderWidth")
            ?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isNumber }?.asFloat
        val colorRaw = style.get("borderColor")
            ?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }?.asString
        if (widthRaw == null && colorRaw == null) return
        val color = colorRaw?.let { parseColor(it) } ?: Color.BLACK
        drawable.setStroke(dp(widthRaw ?: 0f), color)
    }

    /**
     * RN composes user-supplied `style` with internal defaults via
     * `StyleSheet.compose`, which can leave the prop as an array of
     * style objects (e.g. `[{overflow: "hidden"}, {fontSize: 16}]` for
     * Text). Flatten arrays into a single object using last-wins
     * semantics (matching CSS / RN's runtime flattening). Returns the
     * underlying object directly when the prop is already flat.
     */
    private fun styleObject(props: JsonObject): JsonObject? {
        val raw = props.get("style") ?: return null
        if (raw.isJsonObject) return raw.asJsonObject
        if (raw.isJsonArray) {
            val merged = JsonObject()
            for (entry in raw.asJsonArray) {
                if (!entry.isJsonObject) continue
                for ((k, v) in entry.asJsonObject.entrySet()) {
                    if (v.isJsonNull) merged.remove(k) else merged.add(k, v)
                }
            }
            return if (merged.size() == 0) null else merged
        }
        return null
    }

    private fun parseColor(raw: String): Int {
        return when {
            raw.startsWith("rgba(") || raw.startsWith("rgb(") -> parseRgbaString(raw)
            raw.length == 5 && raw.startsWith("#") -> Color.parseColor(expandShortHex(raw))
            raw.length == 4 && raw.startsWith("#") -> Color.parseColor(expandShortHex(raw))
            raw.length == 9 && raw.startsWith("#") -> {
                // #RRGGBBAA → #AARRGGBB
                Color.parseColor("#" + raw.substring(7, 9) + raw.substring(1, 7))
            }
            else -> Color.parseColor(raw)
        }
    }

    private fun parseRgbaString(raw: String): Int {
        val open = raw.indexOf('(')
        val close = raw.indexOf(')')
        if (open < 0 || close <= open) return Color.BLACK
        val parts = raw.substring(open + 1, close).split(',').map { it.trim() }
        if (parts.size < 3) return Color.BLACK
        val r = parts[0].toFloatOrNull()?.toInt()?.coerceIn(0, 255) ?: return Color.BLACK
        val g = parts[1].toFloatOrNull()?.toInt()?.coerceIn(0, 255) ?: return Color.BLACK
        val b = parts[2].toFloatOrNull()?.toInt()?.coerceIn(0, 255) ?: return Color.BLACK
        val a = if (parts.size >= 4) {
            ((parts[3].toFloatOrNull() ?: 1f).coerceIn(0f, 1f) * 255f).toInt()
        } else 255
        return Color.argb(a, r, g, b)
    }

    private fun expandShortHex(raw: String): String {
        val chars = raw.substring(1).map { "$it$it" }.joinToString("")
        return "#$chars"
    }

    private fun dp(value: Float): Int = (value * density).toInt()

    private fun dpF(value: Float): Float = value * density

    companion object {
        private val CORNER_RADIUS_KEYS = listOf(
            "borderRadius",
            "borderTopLeftRadius", "borderTopRightRadius",
            "borderBottomLeftRadius", "borderBottomRightRadius",
            "borderTopStartRadius", "borderTopEndRadius",
            "borderBottomStartRadius", "borderBottomEndRadius",
        )
    }
}
