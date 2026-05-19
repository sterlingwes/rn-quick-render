package com.example.renderer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.BeforeClass
import org.junit.Test
import java.awt.image.BufferedImage
import java.io.File
import javax.imageio.ImageIO

/**
 * Phase 4 step 3 — theme matrix.
 *
 * Renders the screen-sized fixture on a single device (Pixel 5)
 * across the two [ColorScheme] buckets. Unlike the device + font
 * matrices, theme actually changes the *captured* mount-instruction
 * stream because the bsky alf mock's `useTheme()` calls the
 * platform `useColorScheme()` (overridden in `loadRealRn.ts`) and
 * different palette colors land in the rendered props.
 *
 * That means the per-theme input JSON differs — `out/<fixture>.json`
 * for light, `out/<fixture>__dark.json` for dark — and each must
 * be captured separately by the harness. The renderer simply
 * picks the right input JSON and emits a per-theme golden under
 * `src/test/snapshots/matrix/<fixture>_<device>_theme_<scheme>.png`.
 *
 * Record mode:
 *   ./gradlew :renderer:test -Drenderer.record=true \
 *       --tests "com.example.renderer.ThemeMatrixSnapshotTest"
 */
class ThemeMatrixSnapshotTest {

    companion object {
        private val goldenDir = File("src/test/snapshots/matrix")
        private val outputDir = File("build/snapshot-output/matrix")
        private val record = System.getProperty("renderer.record") == "true"

        // Theme is independent of device size — pick one canonical
        // device so the matrix stays a 2-PNG comparison rather than
        // 2 × 4 = 8 mostly-redundant pairs.
        private val device = DeviceProfile.PIXEL_5
        private lateinit var bootstrap: LayoutlibBootstrap

        @JvmStatic
        @BeforeClass
        fun setup() {
            outputDir.mkdirs()
            bootstrap = LayoutlibBootstrap.create(
                device.widthPx, device.heightPx, device.densityDpi,
            )
        }
    }

    @Test fun blueskyOnboardingInterests_light() =
        runMatrix("blueskyOnboardingInterests", ColorScheme.LIGHT)

    @Test fun blueskyOnboardingInterests_dark() =
        runMatrix("blueskyOnboardingInterests", ColorScheme.DARK)

    private fun runMatrix(fixtureName: String, scheme: ColorScheme) {
        val jsonPath = "../rn-harness/out/${fixtureName}${scheme.captureSuffix}.json"
        val json = File(jsonPath).readText()
        val renderer = SnapshotRenderer(
            bootstrap,
            screenWidth = device.widthPx,
            screenHeight = device.heightPx,
            densityDpi = device.densityDpi,
        )
        val image = renderer.render(json)

        val tag = "${fixtureName}_${device.name}_theme_${scheme.name}"
        assertNotNull("$tag: render returned null", image)
        assertTrue("$tag: empty image", image.width > 0 && image.height > 0)
        assertEquals("$tag: width", device.widthPx, image.width)
        assertEquals("$tag: height", device.heightPx, image.height)

        val fresh = File(outputDir, "$tag.png")
        ImageIO.write(image, "png", fresh)

        val golden = File(goldenDir, "$tag.png")
        if (record) {
            goldenDir.mkdirs()
            ImageIO.write(image, "png", golden)
            return
        }
        if (!golden.exists()) {
            fail(
                "$tag: no committed golden at ${golden.path}. " +
                    "Fresh PNG was written to ${fresh.absolutePath}. " +
                    "Re-run with -Drenderer.record=true to record."
            )
        }
        val expected = ImageIO.read(golden)
        compareImages(tag, fresh, image, expected)
    }

    private fun compareImages(
        tag: String,
        freshFile: File,
        actual: BufferedImage,
        expected: BufferedImage,
    ) {
        assertEquals("$tag: width", expected.width, actual.width)
        assertEquals("$tag: height", expected.height, actual.height)

        var diffPixels = 0
        for (y in 0 until expected.height) {
            for (x in 0 until expected.width) {
                if (actual.getRGB(x, y) != expected.getRGB(x, y)) diffPixels++
            }
        }
        if (diffPixels > 0) {
            fail(
                "$tag: $diffPixels pixels differ from golden. " +
                    "Fresh render at ${freshFile.absolutePath}; " +
                    "rerun with -Drenderer.record=true if the change is intentional."
            )
        }
    }
}
