package com.example.renderer

import android.graphics.Paint
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint

/**
 * Text measurement using layoutlib's [TextPaint] + [StaticLayout], matching
 * React Native Android's approach in `ReactTextShadowNode`.
 *
 * RN Android measures text by:
 * 1. Configuring a [TextPaint] with fontSize, fontWeight, fontFamily
 * 2. Building a [StaticLayout] with the text constrained to `availableWidth`
 * 3. Reading back `layout.width` / `layout.height` for the measured size
 *
 * This implementation does the same, using the fonts loaded by layoutlib's
 * Bridge.init() (Roboto family by default).
 *
 * All inputs/outputs are in dp. Internally we work in px (dp × density) and
 * convert back on output, matching how Yoga and the Fabric renderer interact.
 */
class LayoutlibTextMeasurer(
    private val density: Float = 2.625f, // xxhdpi default (420dpi / 160)
    private val fontRegistry: FontRegistry = FontRegistry.EMPTY,
) : YogaLayoutEngine.TextMeasureProvider {

    override fun measure(
        text: CharSequence,
        fontSize: Float,
        fontWeight: String?,
        fontFamily: String?,
        availableWidth: Float,
    ): Pair<Float, Float> {
        if (text.isEmpty()) return 0f to 0f

        val paint = TextPaint(Paint.ANTI_ALIAS_FLAG)
        paint.textSize = fontSize * density

        // Weight bucketing matching RN Android's Typeface resolution:
        // "bold" or >= 600 → BOLD, else NORMAL. Spans on the input may
        // override per-character (StyleSpan, AbsoluteSizeSpan, etc.).
        val weight = resolveWeight(fontWeight)
        paint.typeface = fontRegistry.resolve(fontFamily, weight)

        val widthPx = if (availableWidth.isFinite() && availableWidth > 0) {
            (availableWidth * density).toInt()
        } else {
            Int.MAX_VALUE
        }

        val layout = StaticLayout.Builder
            .obtain(text, 0, text.length, paint, widthPx)
            .setAlignment(Layout.Alignment.ALIGN_NORMAL)
            .setIncludePad(true)
            .build()

        // StaticLayout.getWidth() returns the constraint width, not the actual
        // text extent. For the actual width, scan each line's extent.
        var maxLineWidth = 0f
        for (i in 0 until layout.lineCount) {
            maxLineWidth = maxOf(maxLineWidth, layout.getLineWidth(i))
        }

        val measuredWidth = maxLineWidth / density
        val measuredHeight = layout.height.toFloat() / density

        return measuredWidth to measuredHeight
    }

    private fun resolveWeight(fontWeight: String?): Int {
        if (fontWeight == null) return Typeface.NORMAL
        if (fontWeight == "bold") return Typeface.BOLD
        val numeric = fontWeight.toIntOrNull()
        if (numeric != null && numeric >= 600) return Typeface.BOLD
        return Typeface.NORMAL
    }
}
