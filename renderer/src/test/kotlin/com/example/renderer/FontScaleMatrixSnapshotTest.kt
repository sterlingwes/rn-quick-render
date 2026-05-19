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
 * Phase 4 step 2 — font-scale matrix.
 *
 * Renders the same fixture on a single device (Pixel 5) at five
 * curated [FontScale] buckets that bracket iOS Dynamic Type and
 * Android's "Font size" system setting. Goldens live alongside
 * the device matrix in `src/test/snapshots/matrix/` with a
 * `_fs_<name>` suffix to distinguish them.
 *
 * Scoped to one device on purpose — font scale and device size
 * are largely orthogonal, and a 5 scales × 4 devices cross-product
 * would mostly produce redundant goldens. The matrix renders one
 * fixture at one device across all scales; the prior device
 * matrix covers the device axis at the default scale.
 *
 * Record mode:
 *   ./gradlew :renderer:test -Drenderer.record=true \
 *       --tests "com.example.renderer.FontScaleMatrixSnapshotTest"
 */
class FontScaleMatrixSnapshotTest {

    companion object {
        private val goldenDir = File("src/test/snapshots/matrix")
        private val outputDir = File("build/snapshot-output/matrix")
        private val record = System.getProperty("renderer.record") == "true"

        // Shared across all five scales — Bridge.init() is heavy and
        // independent of fontScale, so one bootstrap covers them all.
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

    @Test fun blueskyOnboardingInterests_compact() =
        runMatrix("blueskyOnboardingInterests", FontScale.COMPACT)

    @Test fun blueskyOnboardingInterests_default() =
        runMatrix("blueskyOnboardingInterests", FontScale.DEFAULT)

    @Test fun blueskyOnboardingInterests_large() =
        runMatrix("blueskyOnboardingInterests", FontScale.LARGE)

    @Test fun blueskyOnboardingInterests_a11y() =
        runMatrix("blueskyOnboardingInterests", FontScale.ACCESSIBILITY)

    @Test fun blueskyOnboardingInterests_a11yMax() =
        runMatrix("blueskyOnboardingInterests", FontScale.ACCESSIBILITY_MAX)

    private fun runMatrix(fixtureName: String, fontScale: FontScale) {
        val json = File("../rn-harness/out/$fixtureName.json").readText()
        val renderer = SnapshotRenderer(
            bootstrap,
            screenWidth = device.widthPx,
            screenHeight = device.heightPx,
            densityDpi = device.densityDpi,
            fontScale = fontScale.scale,
        )
        val image = renderer.render(json)

        val tag = "${fixtureName}_${device.name}_fs_${fontScale.name}"
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
