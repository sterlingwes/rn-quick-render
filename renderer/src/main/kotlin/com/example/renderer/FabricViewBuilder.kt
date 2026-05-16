package com.example.renderer

import android.content.Context
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

/**
 * Builds an Android View tree from Fabric mount instructions + Yoga layout rects.
 *
 * Port of `snapshots/.../FabricTranslator.kt`, adapted to work with layoutlib
 * directly (no Paparazzi). Takes [YogaLayoutEngine.LayoutResult] instead of
 * a separate layout JSON file.
 */
class FabricViewBuilder(private val context: Context, private val density: Float) {

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
                "appendChild" -> {
                    val parent = nodes[op.get("parentNodeId").asInt]
                        ?: error("appendChild parent ${op.get("parentNodeId")} not found")
                    parent.children.add(op.get("childNodeId").asInt)
                }
                "appendChildToSet" -> {
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
        return rootView
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
            "RCTParagraph" -> buildTextView(node, all)
            "RCTRawText" -> error("RCTRawText should be consumed by parent RCTParagraph")
            "RCTText" -> error("RCTText should be consumed by parent RCTParagraph as a span")
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
            if (child.viewName == "RCTRawText") continue
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
        if (image.background == null) {
            image.setBackgroundColor(Color.parseColor("#CFD8DC"))
        }
        return image
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
            viewNameOf = { id -> all[id]?.viewName },
            propsOf = { id -> all[id]?.props },
            childrenOf = { id -> all[id]?.children ?: emptyList() },
        )

        // Paragraph base style lives on the TextView itself; spans on the
        // CharSequence above are deltas for nested RCTText runs.
        val style = styleObject(node.props)
        style?.let { s ->
            if (s.has("fontSize")) tv.textSize = s.get("fontSize").asFloat
            if (s.has("color")) tv.setTextColor(parseColor(s.get("color").asString))
            if (s.has("fontWeight")) {
                val w = s.get("fontWeight").asString
                val bold = w == "bold" || w.toIntOrNull()?.let { it >= 600 } == true
                if (bold) tv.setTypeface(tv.typeface, Typeface.BOLD)
            }
        }
        return tv
    }

    // --- Common prop application ---

    private fun applyCommonProps(view: View, props: JsonObject) {
        val style = styleObject(props) ?: return

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

    private fun styleObject(props: JsonObject): JsonObject? =
        if (props.has("style") && props.get("style").isJsonObject)
            props.getAsJsonObject("style") else null

    private fun parseColor(raw: String): Int {
        return when {
            raw.length == 5 && raw.startsWith("#") -> Color.parseColor(expandShortHex(raw))
            raw.length == 4 && raw.startsWith("#") -> Color.parseColor(expandShortHex(raw))
            raw.length == 9 && raw.startsWith("#") -> {
                // #RRGGBBAA → #AARRGGBB
                Color.parseColor("#" + raw.substring(7, 9) + raw.substring(1, 7))
            }
            else -> Color.parseColor(raw)
        }
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
