package com.example.renderer

import org.junit.BeforeClass
import org.junit.Ignore
import org.junit.Test
import java.awt.image.BufferedImage
import java.io.File

/**
 * Diagnostic-only — pixel-samples the scrollView row boundary to identify
 * the source of the faint outline noted in the Phase 2 spot-check. See
 * docs/phase-2.5.md §1 for the hypotheses this is meant to discriminate.
 *
 * Ignored by default so CI does not gate on it. To gather samples:
 *   ./gradlew :renderer:test --tests \
 *     com.example.renderer.ScrollViewOutlineInvestigationTest
 * and read the captured table from the test's stdout in
 * renderer/build/reports/tests/test.
 */
@Ignore("Diagnostic-only; un-ignore to capture pixel samples for the outline investigation.")
class ScrollViewOutlineInvestigationTest {

    companion object {
        private lateinit var bootstrap: LayoutlibBootstrap

        @JvmStatic
        @BeforeClass
        fun setup() {
            bootstrap = LayoutlibBootstrap.create()
        }
    }

    @Test
    fun samplePixelsAroundRow1Boundary() {
        val json = File("../rn-harness/out/scrollView.json").readText()
        val image = SnapshotRenderer(bootstrap).render(json)

        // Geometry assumed at the SnapshotRenderer defaults (1080×2340 @ 440dpi
        // → density 2.75, viewport 392×850 dp).
        //   ScrollContentView padding: 16dp = 44 px
        //   Row 1 (#EEEEEE): height 44dp = 121 px → y ∈ [44, 164] inclusive
        //   marginBottom on row 1: 8dp = 22 px → y ∈ [165, 186] is the gap
        val samples = listOf(
            Sample(500, 100, "row1 interior (deep)"),
            Sample(500,  44, "row1 top edge (y = first in-row px)"),
            Sample(500,  43, "row1 top - 1 (in container padding)"),
            Sample(500, 164, "row1 bottom edge (y = last in-row px)"),
            Sample(500, 165, "row1 bottom + 1 (in margin gap)"),
            Sample(500, 167, "row1 bottom + 3 (deeper into gap)"),
            Sample( 44, 100, "row1 left edge (x = first in-row px)"),
            Sample( 43, 100, "row1 left - 1 (in container padding)"),
        )

        val out = buildString {
            appendLine()
            appendLine("=== ScrollView row outline samples ===")
            appendLine("  x    y    label                                   RGB")
            for (s in samples) {
                appendLine(
                    String.format(
                        "  %-4d %-4d %-40s %s",
                        s.x, s.y, s.label, rgbAt(image, s.x, s.y),
                    )
                )
            }
            appendLine("======================================")
        }
        println(out)
    }

    private data class Sample(val x: Int, val y: Int, val label: String)

    private fun rgbAt(image: BufferedImage, x: Int, y: Int): String {
        val argb = image.getRGB(x, y)
        val a = (argb ushr 24) and 0xFF
        val r = (argb ushr 16) and 0xFF
        val g = (argb ushr 8) and 0xFF
        val b = argb and 0xFF
        return "#%02X%02X%02X (a=%d)".format(r, g, b, a)
    }
}
