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
 * End-to-end Phase 2 goldens: mount instructions → Yoga layout → View tree → PNG.
 *
 * Each test renders one of the five Phase 1 fixtures and compares against a
 * committed PNG under `src/test/snapshots/`. The fresh render is always written
 * to `build/snapshot-output/<fixture>.png` so CI can upload it as an artifact —
 * which is how new goldens get bootstrapped (first run uploads, developer
 * downloads and commits).
 *
 * Record mode (rewrites committed goldens):
 *   ./gradlew :renderer:test -Drenderer.record=true
 */
class SnapshotRendererTest {

    companion object {
        private lateinit var bootstrap: LayoutlibBootstrap

        private val goldenDir = File("src/test/snapshots")
        private val outputDir = File("build/snapshot-output")
        private val record = System.getProperty("renderer.record") == "true"

        @JvmStatic
        @BeforeClass
        fun setup() {
            outputDir.mkdirs()
            bootstrap = LayoutlibBootstrap.create()
        }
    }

    @Test fun simpleView() = runFixture("simpleView")
    @Test fun nestedViews() = runFixture("nestedViews")
    @Test fun textAndImage() = runFixture("textAndImage")
    @Test fun scrollView() = runFixture("scrollView")
    @Test fun conditional() = runFixture("conditional")
    @Test fun nestedTextSpans() = runFixture("nestedTextSpans")
    @Test fun imageResizeModes() = runFixture("imageResizeModes")
    @Test fun transformsAndEffects() = runFixture("transformsAndEffects")
    @Test fun updateBadgeCount() = runFixture("updateBadgeCount")
    @Test fun imageTintAndAsset() = runFixture("imageTintAndAsset")
    @Test fun realRnHelloWorld() = runFixture("realRnHelloWorld")
    @Test fun realRnImageAsset() = runFixture("realRnImageAsset")
    @Test fun realRnRegisteredApp() = runFixture("realRnRegisteredApp")
    @Test fun blueskyDivider() = runFixture("blueskyDivider")
    @Test fun blueskyAdmonition() = runFixture("blueskyAdmonition")
    @Test fun blueskyPasswordUpdated() = runFixture("blueskyPasswordUpdated")
    @Test fun blueskyOnboardingInterests() = runFixture("blueskyOnboardingInterests")
    @Test fun suspendedText() = runFixture("suspendedText")
    @Test fun customFontText() = runFixture(
        "customFontText",
        fontRegistry = FontRegistry().registerFile(
            "TestMono",
            File(javaClass.classLoader.getResource("fonts/LiberationMono-Regular.ttf")!!.toURI()),
        ),
    )

    private fun runFixture(name: String, fontRegistry: FontRegistry = FontRegistry.EMPTY) {
        val json = File("../rn-harness/out/$name.json").readText()
        val renderer = SnapshotRenderer(bootstrap, fontRegistry = fontRegistry)
        val image = renderer.render(json)

        assertNotNull("$name: render returned null", image)
        assertTrue("$name: empty image", image.width > 0 && image.height > 0)

        // Always write the fresh render to build/ so CI can upload it.
        val fresh = File(outputDir, "$name.png")
        ImageIO.write(image, "png", fresh)

        val golden = File(goldenDir, "$name.png")

        if (record) {
            goldenDir.mkdirs()
            ImageIO.write(image, "png", golden)
            return
        }

        if (!golden.exists()) {
            fail(
                "$name: no committed golden at ${golden.path}. " +
                    "Fresh PNG was written to ${fresh.absolutePath}. " +
                    "Run with -Drenderer.record=true to record, or download the " +
                    "phase-2 CI artifact and commit it."
            )
        }

        val expected = ImageIO.read(golden)
        compareImages(name, fresh, image, expected)
    }

    private fun compareImages(
        name: String,
        freshFile: File,
        actual: BufferedImage,
        expected: BufferedImage,
    ) {
        assertEquals("$name: width", expected.width, actual.width)
        assertEquals("$name: height", expected.height, actual.height)

        var diffPixels = 0
        for (y in 0 until expected.height) {
            for (x in 0 until expected.width) {
                if (actual.getRGB(x, y) != expected.getRGB(x, y)) diffPixels++
            }
        }
        if (diffPixels > 0) {
            fail(
                "$name: $diffPixels pixels differ from golden. " +
                    "Fresh render at ${freshFile.absolutePath}; " +
                    "rerun with -Drenderer.record=true if the change is intentional."
            )
        }
    }
}
