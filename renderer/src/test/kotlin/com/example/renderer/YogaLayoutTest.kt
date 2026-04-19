package com.example.renderer

import com.example.renderer.YogaLayoutEngine.LayoutRect
import org.junit.Assert.*
import org.junit.Test
import java.io.File

/**
 * Port of `rn-harness/test/layout.test.ts` — verifies that the Kotlin
 * [YogaLayoutEngine] produces identical rects to the TypeScript version
 * for all committed fixtures.
 */
class YogaLayoutTest {

    private val engine = YogaLayoutEngine()

    private fun loadFixture(name: String): String {
        val path = File(System.getProperty("user.dir"), "../rn-harness/out/$name.json")
        require(path.exists()) { "Missing fixture: ${path.absolutePath}" }
        return path.readText()
    }

    @Test
    fun simpleView_respectsExplicitWidthHeight() {
        val result = engine.computeLayout(loadFixture("simpleView"))
        assertEquals(listOf(1), result.roots)
        assertEquals(LayoutRect(0f, 0f, 320f, 120f), result.rects[1])
    }

    @Test
    fun nestedViews_stacksRowsWithPaddingAndMargin() {
        val result = engine.computeLayout(loadFixture("nestedViews"))
        assertEquals(listOf(9), result.roots)
        // Outer column takes viewport width
        assertEquals(LayoutRect(0f, 0f, 411f, 128f), result.rects[9])
        // Row 4 at outer's top padding
        assertEquals(LayoutRect(16f, 16f, 379f, 48f), result.rects[4])
        // Row 8 stacks below
        assertEquals(LayoutRect(16f, 64f, 379f, 48f), result.rects[8])
        // First swatch inside row 4
        assertEquals(LayoutRect(8f, 8f, 32f, 32f), result.rects[1])
        // Second swatch: 8 + 32 + 8 margin = 48
        assertEquals(LayoutRect(48f, 8f, 32f, 32f), result.rects[2])
        assertEquals(LayoutRect(88f, 8f, 32f, 32f), result.rects[3])
    }

    @Test
    fun simpleView_customViewport() {
        val result = engine.computeLayout(
            loadFixture("simpleView"),
            YogaLayoutEngine.ComputeLayoutOptions(width = 200, height = 200),
        )
        assertEquals(200 to 200, result.viewport)
        // Root has explicit width/height, viewport doesn't affect it
        assertEquals(LayoutRect(0f, 0f, 320f, 120f), result.rects[1])
    }
}
