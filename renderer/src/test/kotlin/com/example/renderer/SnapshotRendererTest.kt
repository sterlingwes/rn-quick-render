package com.example.renderer

import org.junit.Assert.*
import org.junit.BeforeClass
import org.junit.Test
import java.io.File

/**
 * End-to-end test: mount instructions → Yoga layout → View tree → BufferedImage.
 */
class SnapshotRendererTest {

    companion object {
        private lateinit var bootstrap: LayoutlibBootstrap

        @JvmStatic
        @BeforeClass
        fun setup() {
            bootstrap = LayoutlibBootstrap.create()
        }
    }

    @Test
    fun renderSimpleView() {
        val json = File("../rn-harness/out/simpleView.json").readText()
        val renderer = SnapshotRenderer(bootstrap)
        val image = renderer.render(json)

        assertNotNull(image)
        assertTrue("image width > 0", image.width > 0)
        assertTrue("image height > 0", image.height > 0)
        // Verify it's not all-transparent: check that at least some pixels are non-zero
        val hasContent = (0 until image.width).any { x ->
            (0 until image.height).any { y ->
                image.getRGB(x, y) != 0
            }
        }
        assertTrue("rendered image should have non-transparent content", hasContent)
    }

    @Test
    fun renderTextAndImage() {
        val json = File("../rn-harness/out/textAndImage.json").readText()
        val renderer = SnapshotRenderer(bootstrap)
        val image = renderer.render(json)

        assertNotNull(image)
        assertTrue("image width > 0", image.width > 0)
        assertTrue("image height > 0", image.height > 0)
    }
}
