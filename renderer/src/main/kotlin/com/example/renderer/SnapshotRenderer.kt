package com.example.renderer

import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.View
import android.view.ViewGroup
import java.awt.image.BufferedImage

/**
 * Orchestrates the full snapshot pipeline:
 * 1. Compute Yoga layout from mount instructions (with real text measurement)
 * 2. Build Android View tree from instructions + layout rects
 * 3. Pre-fill the bitmap with [windowBackgroundColor] (matches what a real
 *    device draws under the view tree via `?attr/windowBackground`), then
 *    paint any registered box-shadows under their owning views, then draw
 *    the view tree on top.
 *
 * Views are drawn directly via [Canvas]/[Bitmap] rather than through the
 * render session's `render()` method, matching Paparazzi's approach.
 */
class SnapshotRenderer(
    private val bootstrap: LayoutlibBootstrap,
    private val screenWidth: Int = 1080,
    private val screenHeight: Int = 2340,
    private val densityDpi: Int = 440,
    // Default to opaque white — the windowBackground of Theme.Material.Light
    // and what plain RN apps see by default. Phase 2.5 will wire this to the
    // active theme/Configuration once theming is in.
    private val windowBackgroundColor: Int = Color.WHITE,
) {
    private val density: Float = densityDpi / 160f
    private val viewportWidthDp: Int = (screenWidth / density).toInt()
    private val viewportHeightDp: Int = (screenHeight / density).toInt()

    fun render(instructionsJson: String): BufferedImage {
        val textMeasurer = LayoutlibTextMeasurer(density)
        val engine = YogaLayoutEngine(textMeasurer, textDensity = density)
        val layoutResult = engine.computeLayout(
            instructionsJson,
            YogaLayoutEngine.ComputeLayoutOptions(
                width = viewportWidthDp,
                height = viewportHeightDp,
            ),
        )

        return bootstrap.executeInSession { context ->
            val builder = FabricViewBuilder(context, density)
            val rootView = builder.build(instructionsJson, layoutResult)

            // Measure and layout using the view's own LayoutParams (set by FabricViewBuilder
            // from Yoga layout rects), constrained to screen bounds
            val lp = rootView.layoutParams
            val widthSpec = View.MeasureSpec.makeMeasureSpec(
                lp?.width?.takeIf { it > 0 } ?: screenWidth, View.MeasureSpec.EXACTLY)
            val heightSpec = View.MeasureSpec.makeMeasureSpec(
                lp?.height?.takeIf { it > 0 } ?: screenHeight, View.MeasureSpec.EXACTLY)
            rootView.measure(widthSpec, heightSpec)
            rootView.layout(0, 0, rootView.measuredWidth, rootView.measuredHeight)

            // Draw to a Bitmap via Canvas (layoutlib provides Android's Canvas impl).
            val bitmap = Bitmap.createBitmap(screenWidth, screenHeight, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            // 1. Fill the canvas with the window background so transparent
            //    areas around the view tree render the same color a real
            //    device would show under ?attr/windowBackground.
            canvas.drawColor(windowBackgroundColor)
            // 2. Paint box-shadows from a separate pre-pass. Layoutlib's
            //    software canvas doesn't render platform elevation shadows,
            //    so we render box-shadow (RN's modern cross-platform prop)
            //    ourselves via Paint + BlurMaskFilter before the view tree
            //    draws on top.
            if (builder.boxShadows.isNotEmpty()) {
                paintBoxShadows(rootView, canvas, builder.boxShadows)
            }
            // 3. Draw the view tree, which paints on top of the shadows.
            rootView.draw(canvas)

            // Convert layoutlib Bitmap to AWT BufferedImage
            val image = BufferedImage(screenWidth, screenHeight, BufferedImage.TYPE_INT_ARGB)
            val pixels = IntArray(screenWidth * screenHeight)
            bitmap.getPixels(pixels, 0, screenWidth, 0, 0, screenWidth, screenHeight)
            image.setRGB(0, 0, screenWidth, screenHeight, pixels, 0, screenWidth)
            image
        }
    }

    private fun paintBoxShadows(
        view: View,
        canvas: Canvas,
        shadows: Map<View, List<BoxShadowSpec>>,
        parentLeft: Int = 0,
        parentTop: Int = 0,
    ) {
        val absLeft = parentLeft + view.left
        val absTop = parentTop + view.top
        val specs = shadows[view]
        if (specs != null) {
            for (spec in specs) {
                paintOneShadow(canvas, absLeft, absTop, view.width, view.height, spec)
            }
        }
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                paintBoxShadows(view.getChildAt(i), canvas, shadows, absLeft, absTop)
            }
        }
    }

    private fun paintOneShadow(
        canvas: Canvas,
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

        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = spec.color
            if (blurPx > 0f) {
                maskFilter = BlurMaskFilter(blurPx, BlurMaskFilter.Blur.NORMAL)
            }
        }
        canvas.drawRect(
            x + offsetXPx - spreadPx,
            y + offsetYPx - spreadPx,
            x + w + offsetXPx + spreadPx,
            y + h + offsetYPx + spreadPx,
            paint,
        )
    }
}
