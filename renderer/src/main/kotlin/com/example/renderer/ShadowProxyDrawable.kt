package com.example.renderer

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.drawable.Drawable
import android.view.View
import kotlin.math.max
import kotlin.math.pow

/**
 * Paints box-shadows on behalf of one or more shadowed children, then
 * delegates to an inner background drawable (if any) so the parent's
 * own background still renders.
 *
 * Installed on the *parent* ViewGroup so the draw order is:
 *   1. parent's original background
 *   2. each registered child's shadows, at the child's current
 *      `left/top/width/height` (read at draw time so any post-layout
 *      adjustments are reflected)
 *   3. parent's dispatchDraw → children draw on top
 *
 * That ordering matches how `View.elevation` layers shadows on real
 * Android. The shadows are read from the child views at draw time so
 * positions are correct even if layout changes between build and draw.
 *
 * Blur falloff is approximated with concentric expanded rects rather
 * than a true Gaussian — layoutlib's software canvas doesn't implement
 * `BlurMaskFilter`, so we hand-roll a deterministic falloff that's
 * monotonically decreasing and matches the input alpha at the rect's
 * edge.
 */
internal class ShadowProxyDrawable(
    private val inner: Drawable?,
    private val children: List<Pair<View, List<BoxShadowSpec>>>,
    private val density: Float,
) : Drawable() {

    override fun draw(canvas: Canvas) {
        inner?.let {
            it.bounds = bounds
            it.draw(canvas)
        }
        val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG)
        for ((child, specs) in children) {
            for (spec in specs) {
                paintShadow(canvas, ringPaint, child.left, child.top, child.width, child.height, spec)
            }
        }
    }

    override fun setAlpha(alpha: Int) { inner?.alpha = alpha }
    override fun setColorFilter(colorFilter: ColorFilter?) { inner?.colorFilter = colorFilter }
    @Suppress("DEPRECATION")
    override fun getOpacity(): Int = inner?.opacity ?: PixelFormat.TRANSLUCENT

    private fun paintShadow(
        canvas: Canvas,
        paint: Paint,
        x: Int,
        y: Int,
        w: Int,
        h: Int,
        spec: BoxShadowSpec,
    ) {
        val offsetXPx = spec.offsetX * density
        val offsetYPx = spec.offsetY * density
        val blurPx = spec.blurRadius * density
        val spreadPx = spec.spreadDistance * density

        val baseLeft = x + offsetXPx - spreadPx
        val baseTop = y + offsetYPx - spreadPx
        val baseRight = x + w + offsetXPx + spreadPx
        val baseBottom = y + h + offsetYPx + spreadPx
        val color = spec.color

        if (blurPx <= 0f) {
            paint.color = color
            canvas.drawRect(baseLeft, baseTop, baseRight, baseBottom, paint)
            return
        }

        val baseAlpha = (Color.alpha(color) / 255f).coerceIn(0f, 1f)
        if (baseAlpha <= 0f) return
        val rings = max(1, blurPx.toInt())
        val perRingAlpha = 1f - (1f - baseAlpha).pow(1f / rings)
        val ringAlpha255 = (perRingAlpha * 255f).toInt().coerceIn(1, 255)
        paint.color = Color.argb(
            ringAlpha255,
            Color.red(color),
            Color.green(color),
            Color.blue(color),
        )
        for (i in 0 until rings) {
            val expand = (i.toFloat() / rings.toFloat()) * blurPx
            canvas.drawRect(
                baseLeft - expand,
                baseTop - expand,
                baseRight + expand,
                baseBottom + expand,
                paint,
            )
        }
    }
}
