package com.example.renderer

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.view.View
import java.awt.image.BufferedImage

/**
 * Orchestrates the full snapshot pipeline:
 * 1. Compute Yoga layout from mount instructions (with real text measurement)
 * 2. Build Android View tree from instructions + layout rects
 * 3. Pre-fill the bitmap with [windowBackgroundColor] (matches what a real
 *    device draws under the view tree via `?attr/windowBackground`), then
 *    measure / layout / draw the view tree on top.
 *
 * Box-shadows are painted inside the view tree's draw pass by a
 * [ShadowProxyDrawable] installed on each shadowed view's parent in
 * [FabricViewBuilder]; this renderer doesn't need to know about them.
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
    // Custom font registry. Empty by default — fontFamily lookups fall
    // through to layoutlib's bundled families (Roboto + Noto).
    private val fontRegistry: FontRegistry = FontRegistry.EMPTY,
) {
    private val density: Float = densityDpi / 160f
    private val viewportWidthDp: Int = (screenWidth / density).toInt()
    private val viewportHeightDp: Int = (screenHeight / density).toInt()

    fun render(instructionsJson: String): BufferedImage {
        val textMeasurer = LayoutlibTextMeasurer(density, fontRegistry)
        val engine = YogaLayoutEngine(textMeasurer, textDensity = density)
        val layoutResult = engine.computeLayout(
            instructionsJson,
            YogaLayoutEngine.ComputeLayoutOptions(
                width = viewportWidthDp,
                height = viewportHeightDp,
            ),
        )

        return bootstrap.executeInSession { context ->
            val builder = FabricViewBuilder(context, density, fontRegistry)
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
            // Pre-fill with the window background so transparent areas around the
            // view tree render the same color a real device would show under
            // ?attr/windowBackground.
            val bitmap = Bitmap.createBitmap(screenWidth, screenHeight, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            canvas.drawColor(windowBackgroundColor)
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
