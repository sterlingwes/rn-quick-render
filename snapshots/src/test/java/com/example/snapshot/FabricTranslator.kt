package com.example.snapshot

import android.content.Context
import android.graphics.Color
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.ScrollView
import android.widget.TextView
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import java.io.File

/**
 * Phase 2 translator: takes a captured Fabric mount-instruction stream
 * (`<fixture>.json`) and a Yoga-computed layout (`<fixture>.layout.json`)
 * and materialises the equivalent Android View tree.
 *
 * Layout is already solved in Node — each Yoga node's computed {left, top, w, h}
 * comes in `layout.json` keyed by `nodeId`, relative to the parent. We place
 * children with [FrameLayout.LayoutParams] using topMargin/leftMargin for
 * absolute positioning; Android's view system then just paints.
 *
 * Unsupported instruction variants (clones, mutations) throw — Phase 1 fixtures
 * are all initial mounts, so this is a loud failure if we ever regress into
 * an update path without plumbing it through.
 */
class FabricTranslator(private val context: Context) {

    data class Rect(val left: Int, val top: Int, val width: Int, val height: Int)

    private data class NodeSpec(
        val nodeId: Int,
        val viewName: String,
        val props: JsonObject,
        val children: MutableList<Int> = mutableListOf(),
    )

    fun translateFromFiles(instructionsFile: File, layoutFile: File): View {
        val instructions = JsonParser.parseReader(instructionsFile.reader()).asJsonObject
        val layout = JsonParser.parseReader(layoutFile.reader()).asJsonObject
        return translate(instructions, layout)
    }

    fun translate(instructions: JsonObject, layout: JsonObject): View {
        val nodes = mutableMapOf<Int, NodeSpec>()
        var rootNodeId: Int = -1

        val ops = instructions.getAsJsonArray("instructions")
        for (opEl in ops) {
            val op = opEl.asJsonObject
            when (op.get("op").asString) {
                "createNode" -> {
                    val id = op.get("nodeId").asInt
                    val viewName = op.get("viewName").asString
                    val props = if (op.has("props") && op.get("props").isJsonObject) op.getAsJsonObject("props") else JsonObject()
                    nodes[id] = NodeSpec(id, viewName, props)
                }
                "appendChild" -> {
                    val parent = nodes[op.get("parentNodeId").asInt]
                        ?: error("appendChild parent ${op.get("parentNodeId")} not found")
                    parent.children.add(op.get("childNodeId").asInt)
                }
                "appendChildToSet" -> {
                    // Collect into the surface's child set until completeRoot fires.
                    rootNodeId = op.get("childNodeId").asInt
                }
                "createChildSet", "completeRoot", "registerEventHandler" -> { /* no-op for mount */ }
                "cloneNode", "cloneNodeWithNewChildren", "cloneNodeWithNewProps",
                "cloneNodeWithNewChildrenAndProps" ->
                    error("Clone ops are not yet supported by the Phase 2 translator: ${op.get("op").asString}")
                else -> { /* runtime-only ops like dispatchCommand — ignore */ }
            }
        }

        require(rootNodeId != -1) { "No root node — instruction stream never emitted appendChildToSet/completeRoot" }

        val rects = parseRects(layout)
        val rootRect = rects[rootNodeId]
            ?: error("No layout rect for root node $rootNodeId")

        val rootView = buildView(nodes.getValue(rootNodeId), nodes, rects)
        // The outer container is sized to the root's rect so Paparazzi knows the
        // canvas dimensions. No margins on the outer — its extent is the extent.
        rootView.layoutParams = FrameLayout.LayoutParams(dp(rootRect.width), dp(rootRect.height))
        return rootView
    }

    private fun parseRects(layout: JsonObject): Map<Int, Rect> {
        val rectsJson = layout.getAsJsonObject("rects")
        val out = HashMap<Int, Rect>(rectsJson.size())
        for ((key, value) in rectsJson.entrySet()) {
            val r = value.asJsonObject
            out[key.toInt()] = Rect(
                left = r.get("left").asDouble.toInt(),
                top = r.get("top").asDouble.toInt(),
                width = r.get("width").asDouble.toInt(),
                height = r.get("height").asDouble.toInt(),
            )
        }
        return out
    }

    private fun buildView(
        node: NodeSpec,
        all: Map<Int, NodeSpec>,
        rects: Map<Int, Rect>,
    ): View {
        return when (node.viewName) {
            "RCTView", "RCTScrollContentView" -> buildFrameLayout(node, all, rects)
            "RCTScrollView" -> buildScrollView(node, all, rects)
            "RCTImageView" -> buildImageView(node)
            "RCTParagraph" -> buildTextView(node, all)
            "RCTRawText" -> error("RCTRawText should be consumed by a parent RCTParagraph, not rendered standalone")
            else -> buildFrameLayout(node, all, rects).also {
                // Unknown host types render as plain FrameLayouts — Phase 3's
                // native-module audit will tell us which ones actually matter.
            }
        }
    }

    private fun buildFrameLayout(node: NodeSpec, all: Map<Int, NodeSpec>, rects: Map<Int, Rect>): FrameLayout {
        val group = FrameLayout(context)
        applyCommonProps(group, node.props)
        for (childId in node.children) {
            val child = all[childId] ?: continue
            if (child.viewName == "RCTRawText") continue // consumed by paragraph
            val childRect = rects[childId] ?: continue
            val childView = buildView(child, all, rects)
            val lp = FrameLayout.LayoutParams(dp(childRect.width), dp(childRect.height))
            lp.leftMargin = dp(childRect.left)
            lp.topMargin = dp(childRect.top)
            group.addView(childView, lp)
        }
        return group
    }

    private fun buildScrollView(node: NodeSpec, all: Map<Int, NodeSpec>, rects: Map<Int, Rect>): ScrollView {
        val scroll = ScrollView(context)
        applyCommonProps(scroll, node.props)
        // RCTScrollView has exactly one content child (RCTScrollContentView in our
        // fixtures). Position it at the scroll view's origin; Android ScrollView
        // only takes one child anyway.
        val contentId = node.children.firstOrNull() ?: return scroll
        val content = all[contentId] ?: return scroll
        val contentRect = rects[contentId] ?: return scroll
        val contentView = buildView(content, all, rects)
        scroll.addView(contentView, FrameLayout.LayoutParams(dp(contentRect.width), dp(contentRect.height)))
        return scroll
    }

    private fun buildImageView(node: NodeSpec): ImageView {
        val image = ImageView(context)
        applyCommonProps(image, node.props)
        // No real image loading in Phase 2 — paint a solid fallback so the
        // slot is visible. Phase 3+ wires an actual image pipeline.
        if (image.background == null) {
            image.setBackgroundColor(Color.parseColor("#CFD8DC"))
        }
        return image
    }

    private fun buildTextView(node: NodeSpec, all: Map<Int, NodeSpec>): TextView {
        val tv = TextView(context)
        applyCommonProps(tv, node.props)
        val text = collectRawText(node, all)
        tv.text = text
        val style = styleObject(node.props)
        style?.let { s ->
            if (s.has("fontSize")) tv.textSize = s.get("fontSize").asFloat
            if (s.has("color")) tv.setTextColor(parseColor(s.get("color").asString))
            if (s.has("fontWeight")) {
                val w = s.get("fontWeight").asString
                // Minimal: bold toggle. Proper weight bucketing lives in Phase 2.5.
                val bold = w == "bold" || w.toIntOrNull()?.let { it >= 600 } == true
                if (bold) tv.setTypeface(tv.typeface, android.graphics.Typeface.BOLD)
            }
        }
        return tv
    }

    private fun collectRawText(node: NodeSpec, all: Map<Int, NodeSpec>): String {
        val sb = StringBuilder()
        val stack = ArrayDeque<NodeSpec>()
        stack.addLast(node)
        while (stack.isNotEmpty()) {
            val cur = stack.removeLast()
            if (cur.viewName == "RCTRawText" && cur.props.has("text")) {
                sb.append(cur.props.get("text").asString)
            }
            // Stable order: push children in reverse so we pop them left-to-right.
            for (i in cur.children.indices.reversed()) {
                val child = all[cur.children[i]] ?: continue
                stack.addLast(child)
            }
        }
        return sb.toString()
    }

    private fun applyCommonProps(view: View, props: JsonObject) {
        val style = styleObject(props) ?: return
        if (style.has("backgroundColor")) {
            view.setBackgroundColor(parseColor(style.get("backgroundColor").asString))
        }
    }

    private fun styleObject(props: JsonObject): JsonObject? =
        if (props.has("style") && props.get("style").isJsonObject) props.getAsJsonObject("style") else null

    private fun parseColor(raw: String): Int {
        // React Native accepts #RGB, #RGBA, #RRGGBB, #RRGGBBAA, rgb(), rgba(),
        // hsl(), named colors. Phase 2 handles the hex forms; everything else
        // falls through to Android's native parser which covers #AARRGGBB and
        // named colors.
        return when {
            raw.length == 5 && raw.startsWith("#") -> Color.parseColor(expandShortHex(raw))
            raw.length == 4 && raw.startsWith("#") -> Color.parseColor(expandShortHex(raw))
            raw.length == 9 && raw.startsWith("#") -> {
                // #RRGGBBAA → #AARRGGBB for Android
                Color.parseColor("#" + raw.substring(7, 9) + raw.substring(1, 7))
            }
            else -> Color.parseColor(raw)
        }
    }

    private fun expandShortHex(raw: String): String {
        val chars = raw.substring(1).map { "$it$it" }.joinToString("")
        return "#$chars"
    }

    private fun dp(value: Int): Int =
        (value * context.resources.displayMetrics.density).toInt()

    companion object {
        /** Unused, here to keep Gson pre-registered if we expand to typed parsing later. */
        @Suppress("unused")
        private val gson = Gson()
    }
}
