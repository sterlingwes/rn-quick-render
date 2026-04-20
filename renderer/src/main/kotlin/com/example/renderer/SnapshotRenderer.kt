package com.example.renderer

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import java.awt.image.BufferedImage

/**
 * Orchestrates the full snapshot pipeline:
 * 1. Compute Yoga layout from mount instructions (with real text measurement)
 * 2. Build Android View tree from instructions + layout rects
 * 3. Measure, layout, and draw the view tree to a BufferedImage
 *
 * Views are drawn directly via [Canvas]/[Bitmap] rather than through the
 * render session's `render()` method, matching Paparazzi's approach.
 */
class SnapshotRenderer(
    private val bootstrap: LayoutlibBootstrap,
    private val screenWidth: Int = 1080,
    private val screenHeight: Int = 2340,
    private val densityDpi: Int = 440,
) {
    private val density: Float = densityDpi / 160f
    private val viewportWidthDp: Int = (screenWidth / density).toInt()
    private val viewportHeightDp: Int = (screenHeight / density).toInt()

    fun render(instructionsJson: String): BufferedImage {
        val textMeasurer = LayoutlibTextMeasurer(density)
        val engine = YogaLayoutEngine(textMeasurer)
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

            // Draw to a Bitmap via Canvas (layoutlib provides Android's Canvas impl)
            val bitmap = Bitmap.createBitmap(screenWidth, screenHeight, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            rootView.draw(canvas)

            // Convert layoutlib Bitmap to AWT BufferedImage
            val image = BufferedImage(screenWidth, screenHeight, BufferedImage.TYPE_INT_ARGB)
            val pixels = IntArray(screenWidth * screenHeight)
            bitmap.getPixels(pixels, 0, screenWidth, 0, 0, screenWidth, screenHeight)
            image.setRGB(0, 0, screenWidth, screenHeight, pixels, 0, screenWidth)
            image
        }
    }
}
