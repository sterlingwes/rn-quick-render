package com.example.renderer

import android.graphics.Color
import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.AbsoluteSizeSpan
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import com.google.gson.JsonObject

/**
 * Walks an `RCTParagraph` subtree (an interleaved mix of `RCTRawText` and
 * `RCTText` children, where `RCTText` may nest further) and produces a
 * [SpannableStringBuilder] in which:
 *
 *  - each `RCTRawText` leaf contributes plain text;
 *  - each enclosing `RCTText` span contributes typed `Span` objects (size,
 *    colour, weight, italic) covering exactly the characters under it.
 *
 * The paragraph's own style is the *base* style — applied to the
 * `TextPaint` (for measurement) and the `TextView` itself (for drawing).
 * Spans on the builder are deltas relative to that base.
 *
 * Used from two places that walk independent tree representations:
 *   - [YogaLayoutEngine] when constructing the text handed to the measurer.
 *   - [FabricViewBuilder] when constructing the `TextView`'s text.
 * Both call in via accessor lambdas so we don't bind to either engine's
 * internal Node type.
 */
object ParagraphTextBuilder {

    /**
     * @param paragraphChildIds direct children of the `RCTParagraph` in order.
     * @param density px-per-dp factor. `AbsoluteSizeSpan` works in pixels;
     *   span `fontSize` values are dp, so we multiply when we set the span.
     * @param viewNameOf maps node id → view name (`RCTRawText` / `RCTText` /…).
     * @param propsOf maps node id → props JsonObject.
     * @param childrenOf maps node id → ordered list of child ids.
     */
    fun build(
        paragraphChildIds: List<Int>,
        density: Float,
        viewNameOf: (Int) -> String?,
        propsOf: (Int) -> JsonObject?,
        childrenOf: (Int) -> List<Int>,
    ): SpannableStringBuilder {
        val out = SpannableStringBuilder()
        for (childId in paragraphChildIds) {
            append(childId, out, SpanStyle.EMPTY, density, viewNameOf, propsOf, childrenOf)
        }
        return out
    }

    /** True if there's any `RCTText` descendant — caller can short-circuit. */
    fun hasNestedSpans(
        paragraphChildIds: List<Int>,
        viewNameOf: (Int) -> String?,
        childrenOf: (Int) -> List<Int>,
    ): Boolean {
        val stack = ArrayDeque(paragraphChildIds)
        while (stack.isNotEmpty()) {
            val id = stack.removeLast()
            if (viewNameOf(id) == "RCTText") return true
            stack.addAll(childrenOf(id))
        }
        return false
    }

    private fun append(
        nodeId: Int,
        out: SpannableStringBuilder,
        inheritedStyle: SpanStyle,
        density: Float,
        viewNameOf: (Int) -> String?,
        propsOf: (Int) -> JsonObject?,
        childrenOf: (Int) -> List<Int>,
    ) {
        val viewName = viewNameOf(nodeId) ?: return
        val props = propsOf(nodeId)
        when (viewName) {
            "RCTRawText" -> {
                val text = props?.get("text")?.takeIf { it.isJsonPrimitive }?.asString ?: return
                if (text.isEmpty()) return
                val start = out.length
                out.append(text)
                applySpans(out, start, out.length, inheritedStyle, density)
            }
            "RCTText" -> {
                val nested = inheritedStyle.mergedWith(props?.getAsJsonObject("style"))
                for (childId in childrenOf(nodeId)) {
                    append(childId, out, nested, density, viewNameOf, propsOf, childrenOf)
                }
            }
            else -> {
                // Other element types nested inside a paragraph aren't modelled
                // yet (e.g. inline <Image>). Skip silently.
            }
        }
    }

    private fun applySpans(
        out: SpannableStringBuilder,
        start: Int,
        end: Int,
        style: SpanStyle,
        density: Float,
    ) {
        if (start >= end) return

        style.fontSize?.let {
            val px = (it * density).toInt()
            out.setSpan(AbsoluteSizeSpan(px), start, end, Spanned.SPAN_INCLUSIVE_EXCLUSIVE)
        }
        style.color?.let {
            out.setSpan(ForegroundColorSpan(it), start, end, Spanned.SPAN_INCLUSIVE_EXCLUSIVE)
        }
        val bold = isBold(style.fontWeight)
        val italic = style.fontStyle == "italic"
        val typefaceFlag = when {
            bold && italic -> Typeface.BOLD_ITALIC
            bold -> Typeface.BOLD
            italic -> Typeface.ITALIC
            else -> Typeface.NORMAL
        }
        if (typefaceFlag != Typeface.NORMAL) {
            out.setSpan(StyleSpan(typefaceFlag), start, end, Spanned.SPAN_INCLUSIVE_EXCLUSIVE)
        }
    }

    private fun isBold(fontWeight: String?): Boolean {
        if (fontWeight == null) return false
        if (fontWeight == "bold") return true
        val numeric = fontWeight.toIntOrNull()
        return numeric != null && numeric >= 600
    }

    private data class SpanStyle(
        val fontSize: Float? = null,
        val fontWeight: String? = null,
        val color: Int? = null,
        val fontStyle: String? = null,
    ) {
        fun mergedWith(props: JsonObject?): SpanStyle {
            if (props == null) return this
            return SpanStyle(
                fontSize = props.get("fontSize")?.takeIf { it.isJsonPrimitive }?.asFloat ?: fontSize,
                fontWeight = props.get("fontWeight")?.let {
                    when {
                        it.isJsonPrimitive && it.asJsonPrimitive.isString -> it.asString
                        it.isJsonPrimitive && it.asJsonPrimitive.isNumber -> it.asInt.toString()
                        else -> null
                    }
                } ?: fontWeight,
                color = props.get("color")?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }
                    ?.asString?.let { parseColor(it) } ?: color,
                fontStyle = props.get("fontStyle")?.takeIf { it.isJsonPrimitive }?.asString ?: fontStyle,
            )
        }

        companion object {
            val EMPTY = SpanStyle()
        }
    }

    private fun parseColor(raw: String): Int {
        return when {
            raw.length == 4 && raw.startsWith("#") -> Color.parseColor(expandShortHex(raw))
            raw.length == 5 && raw.startsWith("#") -> Color.parseColor(expandShortHex(raw))
            raw.length == 9 && raw.startsWith("#") -> {
                // #RRGGBBAA → #AARRGGBB
                Color.parseColor("#" + raw.substring(7, 9) + raw.substring(1, 7))
            }
            else -> Color.parseColor(raw)
        }
    }

    private fun expandShortHex(raw: String): String =
        "#" + raw.substring(1).map { "$it$it" }.joinToString("")
}
