package com.example.renderer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.awt.image.BufferedImage
import java.io.File
import javax.imageio.ImageIO

/**
 * Phase 4 step 1 — device matrix.
 *
 * Renders the same fixture across the [DeviceProfile.ALL] device
 * list and golden-diffs each (fixture, device) combination
 * independently. Goldens live in `src/test/snapshots/matrix/` to
 * keep the flat top-level snapshots directory legible.
 *
 * Currently scoped to the screen-sized tier-4 fixture
 * (`blueskyOnboardingInterests`) — that's the one where device
 * size visibly changes the layout (pill grid wraps differently at
 * 360 dp vs. 928 dp, headline + button rescale). Smaller composite
 * fixtures don't add much information per device class.
 *
 * Each `DeviceProfile` keeps its own `LayoutlibBootstrap` cached
 * in the companion `bootstraps` map — `Bridge.init()` is the
 * expensive part (~4 s on first invocation) and we'd otherwise pay
 * it once per test. The map is JVM-static so a single test
 * process re-uses bootstraps across all combinations.
 *
 * Record mode (rewrites committed goldens):
 *   ./gradlew :renderer:test -Drenderer.record=true \
 *       --tests "com.example.renderer.DeviceMatrixSnapshotTest"
 */
class DeviceMatrixSnapshotTest {

    companion object {
        private val goldenDir = File("src/test/snapshots/matrix")
        private val outputDir = File("build/snapshot-output/matrix")
        private val record = System.getProperty("renderer.record") == "true"

        private val bootstraps = mutableMapOf<DeviceProfile, LayoutlibBootstrap>()

        @Synchronized
        private fun bootstrapFor(profile: DeviceProfile): LayoutlibBootstrap =
            bootstraps.getOrPut(profile) {
                LayoutlibBootstrap.create(
                    profile.widthPx,
                    profile.heightPx,
                    profile.densityDpi,
                )
            }
    }

    @Test fun blueskyOnboardingInterests_smallPhone() =
        runMatrix("blueskyOnboardingInterests", DeviceProfile.SMALL_PHONE)

    @Test fun blueskyOnboardingInterests_pixel5() =
        runMatrix("blueskyOnboardingInterests", DeviceProfile.PIXEL_5)

    @Test fun blueskyOnboardingInterests_pixel7Pro() =
        runMatrix("blueskyOnboardingInterests", DeviceProfile.PIXEL_7_PRO)

    @Test fun blueskyOnboardingInterests_tablet() =
        runMatrix("blueskyOnboardingInterests", DeviceProfile.TABLET)

    private fun runMatrix(fixtureName: String, profile: DeviceProfile) {
        outputDir.mkdirs()
        val bootstrap = bootstrapFor(profile)
        val json = File("../rn-harness/out/$fixtureName.json").readText()
        val renderer = SnapshotRenderer(
            bootstrap,
            screenWidth = profile.widthPx,
            screenHeight = profile.heightPx,
            densityDpi = profile.densityDpi,
        )
        val image = renderer.render(json)

        val tag = "${fixtureName}_${profile.name}"
        assertNotNull("$tag: render returned null", image)
        assertTrue("$tag: empty image", image.width > 0 && image.height > 0)
        assertEquals("$tag: width", profile.widthPx, image.width)
        assertEquals("$tag: height", profile.heightPx, image.height)

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
