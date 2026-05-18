package com.example.renderer

import com.facebook.yoga.*
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser

/**
 * Kotlin port of `rn-harness/src/computeLayout.ts`.
 *
 * Reconstructs a tree from Fabric mount instructions, builds a parallel Yoga
 * node tree with style props applied, runs `calculateLayout()`, and returns
 * per-node layout rects in dp.
 */
class YogaLayoutEngine(
    private val textMeasurer: TextMeasureProvider? = null,
    // px-per-dp; needed when nested-text spans construct AbsoluteSizeSpan(px).
    // Defaults to 1 so the heuristic fallback path (no measurer) keeps working
    // in dp without any conversion.
    private val textDensity: Float = 1f,
) {

    /**
     * Pluggable text measurement — defaults to a crude heuristic when null.
     * Receives a [CharSequence] so callers can pass a `SpannableStringBuilder`
     * with per-span weight/size/colour overrides for nested `<Text>` runs.
     */
    fun interface TextMeasureProvider {
        fun measure(
            text: CharSequence,
            fontSize: Float,
            fontWeight: String?,
            fontFamily: String?,
            availableWidth: Float,
        ): Pair<Float, Float>
    }

    data class LayoutRect(val left: Float, val top: Float, val width: Float, val height: Float)

    data class LayoutResult(
        val viewport: Pair<Int, Int>,
        val rects: Map<Int, LayoutRect>,
        val roots: List<Int>,
    )

    data class ComputeLayoutOptions(
        val width: Int = 411,
        val height: Int = 891,
    )

    // -----------------------------------------------------------------------
    // Internal tree representation
    // -----------------------------------------------------------------------
    private data class Node(
        val nodeId: Int,
        val viewName: String,
        val props: JsonObject,
        val children: MutableList<Int> = mutableListOf(),
    )

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    fun computeLayout(
        instructionsJson: String,
        opts: ComputeLayoutOptions = ComputeLayoutOptions(),
    ): LayoutResult {
        val root = JsonParser.parseString(instructionsJson).asJsonObject
        val instructions = root.getAsJsonArray("instructions")
        return computeLayout(instructions, opts)
    }

    fun computeLayout(
        instructions: JsonArray,
        opts: ComputeLayoutOptions = ComputeLayoutOptions(),
    ): LayoutResult {
        val (nodes, roots) = reconstructTree(instructions)
        val viewport = opts.width to opts.height

        // Parent map — `RCTText` doubles as both top-level paragraph (real
        // RN's lowering of `<Text>`) and a nested span (the host-element
        // DSL's `span()` helper). The distinguishing fact is the parent's
        // viewName, hence the lookup map. RCTVirtualText is unambiguously
        // a nested span (the real-RN name for inner spans).
        val parentOf = HashMap<Int, Int>(nodes.size)
        for (node in nodes.values) {
            for (childId in node.children) parentOf[childId] = node.nodeId
        }
        fun isNestedSpan(n: Node): Boolean = when (n.viewName) {
            "RCTRawText", "RCTVirtualText" -> true
            "RCTText" -> {
                val parent = parentOf[n.nodeId]?.let { nodes[it] }
                parent != null && (parent.viewName == "RCTParagraph" || parent.viewName == "RCTText")
            }
            else -> false
        }

        // Build Yoga nodes. Text leaves (raw text + spans nested inside a
        // paragraph) don't get Yoga nodes — they exist only to carry text
        // + style runs into the parent paragraph's measure function.
        val yogaNodes = mutableMapOf<Int, YogaNode>()
        for (node in nodes.values) {
            if (isNestedSpan(node)) continue
            val y = YogaNodeFactory.create()
            applyStyle(y, flattenedStyle(node))

            if (isTextLeaf(node.viewName)) {
                val spanned = ParagraphTextBuilder.build(
                    paragraphChildIds = node.children,
                    density = textDensity,
                    viewNameOf = { id -> nodes[id]?.viewName },
                    propsOf = { id -> nodes[id]?.props },
                    childrenOf = { id -> nodes[id]?.children ?: emptyList() },
                )
                val style = flattenedStyle(node)
                val fontSize = style?.get("fontSize")?.takeIf { it.isJsonPrimitive }?.asFloat ?: 14f
                val fontWeight = style?.get("fontWeight")?.takeIf { it.isJsonPrimitive }?.asString
                val fontFamily = style?.get("fontFamily")
                    ?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }?.asString
                y.setMeasureFunction(YogaMeasureFunction { _, width, widthMode, _, _ ->
                    val availableWidth = when (widthMode) {
                        YogaMeasureMode.EXACTLY -> width
                        YogaMeasureMode.AT_MOST -> width
                        else -> Float.MAX_VALUE
                    }
                    val (naturalW, h) = measureParagraph(
                        spanned, fontSize, fontWeight, fontFamily, availableWidth,
                    )
                    // EXACTLY mode means Yoga has already decided the width
                    // (typically because the parent's alignItems='stretch'
                    // gave us its cross-axis); honour that so the resulting
                    // TextView is parent-cross-axis wide and `textAlign`
                    // gravity actually has slack to centre / right-align
                    // within. AT_MOST returns natural width capped to the
                    // budget so single-line text doesn't take more room
                    // than it needs.
                    val reportedW = if (widthMode == YogaMeasureMode.EXACTLY) width else naturalW
                    YogaMeasureOutput.make(reportedW, h)
                })
            }

            yogaNodes[node.nodeId] = y
        }

        // Wire parent→child relationships (skip text leaves — they own their layout via measureFunc).
        for (node in nodes.values) {
            val y = yogaNodes[node.nodeId] ?: continue
            if (isTextLeaf(node.viewName)) continue
            node.children.forEachIndexed { idx, childId ->
                val child = yogaNodes[childId]
                if (child != null) y.addChildAt(child, y.childCount)
            }
        }

        // Synthetic surface root
        val surfaceRoot = YogaNodeFactory.create()
        surfaceRoot.setWidth(viewport.first.toFloat())
        surfaceRoot.setHeight(viewport.second.toFloat())
        roots.forEachIndexed { idx, rootId ->
            val y = yogaNodes[rootId]
            if (y != null) surfaceRoot.addChildAt(y, idx)
        }

        surfaceRoot.calculateLayout(
            viewport.first.toFloat(),
            viewport.second.toFloat(),
        )

        val rects = mutableMapOf<Int, LayoutRect>()
        for ((nodeId, y) in yogaNodes) {
            rects[nodeId] = LayoutRect(
                left = round3(y.getLayoutX()),
                top = round3(y.getLayoutY()),
                width = round3(y.getLayoutWidth()),
                height = round3(y.getLayoutHeight()),
            )
        }

        return LayoutResult(viewport, rects, roots)
    }

    // -----------------------------------------------------------------------
    // Tree reconstruction from mount instructions
    // -----------------------------------------------------------------------
    private fun reconstructTree(instructions: JsonArray): Pair<Map<Int, Node>, List<Int>> {
        val nodes = mutableMapOf<Int, Node>()
        val childSets = mutableMapOf<Int, MutableList<Int>>()
        var roots = listOf<Int>()

        for (el in instructions) {
            val op = el.asJsonObject
            when (op.get("op").asString) {
                "createNode" -> {
                    val id = op.get("nodeId").asInt
                    val viewName = op.get("viewName").asString
                    val props = if (op.has("props") && op.get("props").isJsonObject)
                        op.getAsJsonObject("props") else JsonObject()
                    nodes[id] = Node(id, viewName, props)
                }
                "cloneNode" -> cloneNode(op, nodes, keepChildren = true, newProps = null)
                "cloneNodeWithNewProps" -> cloneNode(op, nodes,
                    keepChildren = true,
                    newProps = op.get("newProps")?.takeIf { it.isJsonObject }?.asJsonObject)
                "cloneNodeWithNewChildren" -> cloneNode(op, nodes,
                    keepChildren = false, newProps = null)
                "cloneNodeWithNewChildrenAndProps" -> cloneNode(op, nodes,
                    keepChildren = false,
                    newProps = op.get("newProps")?.takeIf { it.isJsonObject }?.asJsonObject)
                "appendChild" -> {
                    val parent = nodes[op.get("parentNodeId").asInt]
                    parent?.children?.add(op.get("childNodeId").asInt)
                }
                "createChildSet" -> {
                    childSets[op.get("childSetId").asInt] = mutableListOf()
                }
                "appendChildToSet" -> {
                    childSets[op.get("childSetId").asInt]?.add(op.get("childNodeId").asInt)
                }
                "completeRoot" -> {
                    val set = childSets[op.get("childSetId").asInt]
                    if (set != null) roots = set.toList()
                }
            }
        }

        return nodes to roots
    }

    /**
     * Materialise a clone* instruction: create a new node whose viewName
     * matches the source, with children either copied from the source
     * (`keepChildren = true`, for `cloneNode` / `cloneNodeWithNewProps`)
     * or started empty (`keepChildren = false`, for the WithNewChildren
     * variants — subsequent `appendChild` ops will fill them).
     *
     * Props are taken from the source and shallow-merged with `newProps`
     * when present. `null` values in `newProps` remove the key, matching
     * `diffAttributePayloads` in the capture stub. Style is treated as a
     * single top-level attribute and replaced wholesale when emitted.
     */
    private fun cloneNode(
        op: JsonObject,
        nodes: MutableMap<Int, Node>,
        keepChildren: Boolean,
        newProps: JsonObject?,
    ) {
        val id = op.get("nodeId").asInt
        val sourceId = op.get("sourceNodeId").asInt
        val source = nodes[sourceId] ?: return
        val mergedProps = mergeProps(source.props, newProps)
        val children: MutableList<Int> =
            if (keepChildren) source.children.toMutableList() else mutableListOf()
        nodes[id] = Node(id, source.viewName, mergedProps, children)
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

    // -----------------------------------------------------------------------
    // Style application
    // -----------------------------------------------------------------------
    private fun applyStyle(node: YogaNode, style: JsonObject?) {
        if (style == null) return

        // Dimension props
        setDimension(node, style, "width") { v -> node.setWidth(v) }
        setDimensionPercent(node, style, "width") { v -> node.setWidthPercent(v) }
        setDimension(node, style, "height") { v -> node.setHeight(v) }
        setDimensionPercent(node, style, "height") { v -> node.setHeightPercent(v) }
        setDimension(node, style, "minWidth") { v -> node.setMinWidth(v) }
        setDimensionPercent(node, style, "minWidth") { v -> node.setMinWidthPercent(v) }
        setDimension(node, style, "minHeight") { v -> node.setMinHeight(v) }
        setDimensionPercent(node, style, "minHeight") { v -> node.setMinHeightPercent(v) }
        setDimension(node, style, "maxWidth") { v -> node.setMaxWidth(v) }
        setDimensionPercent(node, style, "maxWidth") { v -> node.setMaxWidthPercent(v) }
        setDimension(node, style, "maxHeight") { v -> node.setMaxHeight(v) }
        setDimensionPercent(node, style, "maxHeight") { v -> node.setMaxHeightPercent(v) }

        style.get("aspectRatio")?.takeIf { it.isJsonPrimitive }?.asFloat?.let { node.setAspectRatio(it) }

        // Flex props
        style.get("flex")?.takeIf { it.isJsonPrimitive }?.asFloat?.let { node.setFlex(it) }
        style.get("flexGrow")?.takeIf { it.isJsonPrimitive }?.asFloat?.let { node.setFlexGrow(it) }
        style.get("flexShrink")?.takeIf { it.isJsonPrimitive }?.asFloat?.let { node.setFlexShrink(it) }
        applyYogaValue(style, "flexBasis",
            { v -> node.setFlexBasis(v) },
            { v -> node.setFlexBasisPercent(v) })

        style.get("flexDirection")?.takeIf { it.isJsonPrimitive }?.asString?.let {
            FLEX_DIRECTION_MAP[it]?.let { fd -> node.setFlexDirection(fd) }
        }
        style.get("flexWrap")?.takeIf { it.isJsonPrimitive }?.asString?.let {
            FLEX_WRAP_MAP[it]?.let { fw -> node.setWrap(fw) }
        }
        style.get("alignItems")?.takeIf { it.isJsonPrimitive }?.asString?.let {
            ALIGN_MAP[it]?.let { a -> node.setAlignItems(a) }
        }
        style.get("alignSelf")?.takeIf { it.isJsonPrimitive }?.asString?.let {
            ALIGN_MAP[it]?.let { a -> node.setAlignSelf(a) }
        }
        style.get("alignContent")?.takeIf { it.isJsonPrimitive }?.asString?.let {
            ALIGN_MAP[it]?.let { a -> node.setAlignContent(a) }
        }
        style.get("justifyContent")?.takeIf { it.isJsonPrimitive }?.asString?.let {
            JUSTIFY_MAP[it]?.let { j -> node.setJustifyContent(j) }
        }

        style.get("position")?.takeIf { it.isJsonPrimitive }?.asString?.let {
            when (it) {
                "absolute" -> node.setPositionType(YogaPositionType.ABSOLUTE)
                "relative" -> node.setPositionType(YogaPositionType.RELATIVE)
            }
        }

        // Edge-addressed props: padding, margin, border
        applyEdgeProps(node, style, "padding", PADDING_KEYS) { edge, value ->
            node.setPadding(edge, value)
        }
        applyEdgePropsPercent(node, style, "padding", PADDING_KEYS) { edge, value ->
            node.setPaddingPercent(edge, value)
        }
        applyEdgeProps(node, style, "margin", MARGIN_KEYS) { edge, value ->
            node.setMargin(edge, value)
        }
        applyEdgePropsPercent(node, style, "margin", MARGIN_KEYS) { edge, value ->
            node.setMarginPercent(edge, value)
        }
        applyEdgeAuto(style, MARGIN_KEYS) { edge -> node.setMarginAuto(edge) }
        applyEdgeProps(node, style, "border", BORDER_KEYS) { edge, value ->
            node.setBorder(edge, value)
        }

        // Position offsets: top, right, bottom, left, start, end
        POSITION_EDGES.forEach { (key, edge) ->
            applyYogaValue(style, key,
                { v -> node.setPosition(edge, v) },
                { v -> node.setPositionPercent(edge, v) })
        }
    }

    // -----------------------------------------------------------------------
    // Yoga value helpers
    // -----------------------------------------------------------------------

    private fun setDimension(node: YogaNode, style: JsonObject, key: String, setter: (Float) -> Unit) {
        val raw = style.get(key) ?: return
        if (raw.isJsonPrimitive && raw.asJsonPrimitive.isNumber) {
            setter(raw.asFloat)
        }
    }

    private fun setDimensionPercent(node: YogaNode, style: JsonObject, key: String, setter: (Float) -> Unit) {
        val raw = style.get(key) ?: return
        if (raw.isJsonPrimitive && raw.asJsonPrimitive.isString) {
            val str = raw.asString
            if (str.endsWith("%")) {
                val v = str.dropLast(1).toFloatOrNull()
                if (v != null) setter(v)
            }
        }
    }

    private fun applyYogaValue(style: JsonObject, key: String, setter: (Float) -> Unit, percentSetter: (Float) -> Unit) {
        val raw = style.get(key) ?: return
        if (raw.isJsonPrimitive) {
            if (raw.asJsonPrimitive.isNumber) {
                setter(raw.asFloat)
            } else if (raw.asJsonPrimitive.isString) {
                val str = raw.asString
                if (str.endsWith("%")) {
                    str.dropLast(1).toFloatOrNull()?.let { percentSetter(it) }
                }
            }
        }
    }

    private fun applyEdgeProps(
        node: YogaNode,
        style: JsonObject,
        base: String,
        keys: List<Pair<String, YogaEdge>>,
        setter: (YogaEdge, Float) -> Unit,
    ) {
        for ((key, edge) in keys) {
            val raw = style.get(key) ?: continue
            if (raw.isJsonPrimitive && raw.asJsonPrimitive.isNumber) {
                setter(edge, raw.asFloat)
            }
        }
    }

    private fun applyEdgePropsPercent(
        node: YogaNode,
        style: JsonObject,
        base: String,
        keys: List<Pair<String, YogaEdge>>,
        setter: (YogaEdge, Float) -> Unit,
    ) {
        for ((key, edge) in keys) {
            val raw = style.get(key) ?: continue
            if (raw.isJsonPrimitive && raw.asJsonPrimitive.isString) {
                val str = raw.asString
                if (str.endsWith("%")) {
                    str.dropLast(1).toFloatOrNull()?.let { setter(edge, it) }
                }
            }
        }
    }

    /**
     * For each edge whose style value is the literal string "auto", invoke
     * [setter]. Only meaningful for margins — Yoga's auto-margin distributes
     * remaining flex slack along the relevant axis (e.g. `marginLeft: auto`
     * + `marginRight: auto` pushes a narrower-than-parent item to the
     * cross-axis centre).
     */
    private fun applyEdgeAuto(
        style: JsonObject,
        keys: List<Pair<String, YogaEdge>>,
        setter: (YogaEdge) -> Unit,
    ) {
        for ((key, edge) in keys) {
            val raw = style.get(key) ?: continue
            if (raw.isJsonPrimitive && raw.asJsonPrimitive.isString && raw.asString == "auto") {
                setter(edge)
            }
        }
    }

    // -----------------------------------------------------------------------
    // Text measurement
    // -----------------------------------------------------------------------
    private fun isTextLeaf(viewName: String): Boolean =
        // RCTParagraph is what the host-element DSL fixtures emit;
        // RCTText is what real `react-native` lowers `<Text>` to via
        // its TextNativeComponent. Both name a paragraph-level text
        // host whose children are RCTRawText leaves + RCTText spans.
        viewName == "RCTParagraph" || viewName == "RCTText"

    /**
     * Real RN composes user style with internal defaults via
     * `StyleSheet.compose`, so `props.style` can be either a plain
     * object or an arbitrarily nested array. Delegates to the shared
     * [StyleFlattener] so Yoga layout, view building, and paragraph
     * text all agree on what an array-of-arrays collapses to.
     */
    private fun flattenedStyle(node: Node): JsonObject? =
        StyleFlattener.flatten(node.props.get("style"))

    private fun measureParagraph(
        text: CharSequence,
        fontSize: Float,
        fontWeight: String?,
        fontFamily: String?,
        availableWidth: Float,
    ): Pair<Float, Float> {
        if (text.isEmpty()) return 0f to 0f

        // Delegate to pluggable measurer if available
        if (textMeasurer != null) {
            return textMeasurer.measure(text, fontSize, fontWeight, fontFamily, availableWidth)
        }

        // Heuristic fallback — matches computeLayout.ts. Ignores spans.
        val charW = fontSize * AVG_CHAR_WIDTH_RATIO
        val lineH = fontSize * LINE_HEIGHT_RATIO
        val unconstrainedW = text.length * charW
        val effectiveW = if (availableWidth.isFinite() && availableWidth > 0)
            minOf(unconstrainedW, availableWidth) else unconstrainedW
        val charsPerLine = maxOf(1, ((if (effectiveW > 0) effectiveW else unconstrainedW) / charW).toInt())
        val lines = maxOf(1, (text.length + charsPerLine - 1) / charsPerLine) // ceil division
        return effectiveW to (lines * lineH)
    }

    // -----------------------------------------------------------------------
    // Utilities
    // -----------------------------------------------------------------------
    private fun round3(v: Float): Float =
        (Math.round(v * 1000.0) / 1000.0).toFloat()

    companion object {
        private const val AVG_CHAR_WIDTH_RATIO = 0.55f
        private const val LINE_HEIGHT_RATIO = 1.25f

        private val FLEX_DIRECTION_MAP = mapOf(
            "row" to YogaFlexDirection.ROW,
            "row-reverse" to YogaFlexDirection.ROW_REVERSE,
            "column" to YogaFlexDirection.COLUMN,
            "column-reverse" to YogaFlexDirection.COLUMN_REVERSE,
        )
        private val FLEX_WRAP_MAP = mapOf(
            "nowrap" to YogaWrap.NO_WRAP,
            "wrap" to YogaWrap.WRAP,
            "wrap-reverse" to YogaWrap.WRAP_REVERSE,
        )
        private val ALIGN_MAP = mapOf(
            "auto" to YogaAlign.AUTO,
            "flex-start" to YogaAlign.FLEX_START,
            "center" to YogaAlign.CENTER,
            "flex-end" to YogaAlign.FLEX_END,
            "stretch" to YogaAlign.STRETCH,
            "baseline" to YogaAlign.BASELINE,
            "space-between" to YogaAlign.SPACE_BETWEEN,
            "space-around" to YogaAlign.SPACE_AROUND,
        )
        private val JUSTIFY_MAP = mapOf(
            "flex-start" to YogaJustify.FLEX_START,
            "center" to YogaJustify.CENTER,
            "flex-end" to YogaJustify.FLEX_END,
            "space-between" to YogaJustify.SPACE_BETWEEN,
            "space-around" to YogaJustify.SPACE_AROUND,
            "space-evenly" to YogaJustify.SPACE_EVENLY,
        )

        private val PADDING_KEYS = listOf(
            "padding" to YogaEdge.ALL,
            "paddingHorizontal" to YogaEdge.HORIZONTAL,
            "paddingVertical" to YogaEdge.VERTICAL,
            "paddingTop" to YogaEdge.TOP,
            "paddingRight" to YogaEdge.RIGHT,
            "paddingBottom" to YogaEdge.BOTTOM,
            "paddingLeft" to YogaEdge.LEFT,
            "paddingStart" to YogaEdge.START,
            "paddingEnd" to YogaEdge.END,
        )
        private val MARGIN_KEYS = listOf(
            "margin" to YogaEdge.ALL,
            "marginHorizontal" to YogaEdge.HORIZONTAL,
            "marginVertical" to YogaEdge.VERTICAL,
            "marginTop" to YogaEdge.TOP,
            "marginRight" to YogaEdge.RIGHT,
            "marginBottom" to YogaEdge.BOTTOM,
            "marginLeft" to YogaEdge.LEFT,
            "marginStart" to YogaEdge.START,
            "marginEnd" to YogaEdge.END,
        )
        private val BORDER_KEYS = listOf(
            "borderWidth" to YogaEdge.ALL,
            "borderTopWidth" to YogaEdge.TOP,
            "borderRightWidth" to YogaEdge.RIGHT,
            "borderBottomWidth" to YogaEdge.BOTTOM,
            "borderLeftWidth" to YogaEdge.LEFT,
            "borderStartWidth" to YogaEdge.START,
            "borderEndWidth" to YogaEdge.END,
        )
        private val POSITION_EDGES = listOf(
            "top" to YogaEdge.TOP,
            "right" to YogaEdge.RIGHT,
            "bottom" to YogaEdge.BOTTOM,
            "left" to YogaEdge.LEFT,
            "start" to YogaEdge.START,
            "end" to YogaEdge.END,
        )
    }
}
