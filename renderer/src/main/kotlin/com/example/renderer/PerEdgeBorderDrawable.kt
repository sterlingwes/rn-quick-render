package com.example.renderer

import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.drawable.Drawable

/**
 * Paints per-edge borders on top of an inner background drawable (or
 * none). Used when a view's style sets any of `borderTopWidth` /
 * `borderRightWidth` / `borderBottomWidth` / `borderLeftWidth` (or
 * the matching color props), which Android's `GradientDrawable.setStroke`
 * can't express — it only handles a uniform border around all four
 * edges.
 *
 * Each width / color is provided in pixels (caller multiplied by
 * density). Zero widths skip drawing the corresponding edge.
 *
 * Corner radii and per-edge borders together are a more involved
 * shape (rounded rectangles with varying stroke widths per side need
 * arc geometry). When the view also sets a corner radius the inner
 * drawable handles the rounded background; the borders here paint
 * straight rect strips that don't follow the radius. Fixtures that
 * combine the two will look slightly off until that's tightened.
 */
internal class PerEdgeBorderDrawable(
    private val inner: Drawable?,
    private val topWidth: Float,
    private val topColor: Int,
    private val rightWidth: Float,
    private val rightColor: Int,
    private val bottomWidth: Float,
    private val bottomColor: Int,
    private val leftWidth: Float,
    private val leftColor: Int,
) : Drawable() {

    override fun draw(canvas: Canvas) {
        inner?.let {
            it.bounds = bounds
            it.draw(canvas)
        }
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val l = bounds.left.toFloat()
        val t = bounds.top.toFloat()
        val r = bounds.right.toFloat()
        val b = bounds.bottom.toFloat()
        if (topWidth > 0f) {
            paint.color = topColor
            canvas.drawRect(l, t, r, t + topWidth, paint)
        }
        if (rightWidth > 0f) {
            paint.color = rightColor
            canvas.drawRect(r - rightWidth, t, r, b, paint)
        }
        if (bottomWidth > 0f) {
            paint.color = bottomColor
            canvas.drawRect(l, b - bottomWidth, r, b, paint)
        }
        if (leftWidth > 0f) {
            paint.color = leftColor
            canvas.drawRect(l, t, l + leftWidth, b, paint)
        }
    }

    override fun setAlpha(alpha: Int) {
        inner?.alpha = alpha
    }

    override fun setColorFilter(colorFilter: ColorFilter?) {
        inner?.colorFilter = colorFilter
    }

    @Suppress("DEPRECATION")
    override fun getOpacity(): Int = inner?.opacity ?: PixelFormat.TRANSLUCENT
}
