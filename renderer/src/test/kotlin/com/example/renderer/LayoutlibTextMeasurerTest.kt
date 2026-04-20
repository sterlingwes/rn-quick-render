package com.example.renderer

import org.junit.Assert.*
import org.junit.BeforeClass
import org.junit.Test

/**
 * Verifies that [LayoutlibTextMeasurer] produces sensible measurements
 * using layoutlib's real font rendering (Roboto via Bridge.init()).
 */
class LayoutlibTextMeasurerTest {

    companion object {
        private lateinit var measurer: LayoutlibTextMeasurer

        @JvmStatic
        @BeforeClass
        fun setup() {
            // Bootstrap layoutlib so fonts are loaded for TextPaint
            LayoutlibBootstrap.create()
            measurer = LayoutlibTextMeasurer()
        }
    }

    @Test
    fun measureSingleLineText() {
        val (width, height) = measurer.measure("Hello World", 14f, null, Float.MAX_VALUE)
        // Roboto 14dp single-line: width should be roughly 70-90dp, height ~16-20dp
        assertTrue("width ($width) should be > 0", width > 0f)
        assertTrue("height ($height) should be > 0", height > 0f)
        assertTrue("width ($width) should be reasonable for 'Hello World' at 14dp", width in 30f..150f)
        assertTrue("height ($height) should be roughly one line", height in 10f..30f)
    }

    @Test
    fun measureWrappedText() {
        val text = "This is a longer piece of text that should wrap to multiple lines"
        val (wideW, wideH) = measurer.measure(text, 14f, null, Float.MAX_VALUE)
        val (narrowW, narrowH) = measurer.measure(text, 14f, null, 100f)

        // Constrained to 100dp should wrap: narrower width, taller height
        assertTrue("narrow width ($narrowW) <= ~100dp", narrowW <= 105f) // rounding from px→dp conversion
        assertTrue("narrow height ($narrowH) > single-line height ($wideH)", narrowH > wideH)
    }

    @Test
    fun boldTextMeasuresDifferently() {
        val text = "Bold versus Normal"
        val (normalW, _) = measurer.measure(text, 14f, null, Float.MAX_VALUE)
        val (boldW, _) = measurer.measure(text, 14f, "bold", Float.MAX_VALUE)

        // Bold glyphs are wider than normal in Roboto
        assertTrue("bold width ($boldW) should differ from normal width ($normalW)",
            boldW != normalW)
    }

    @Test
    fun fontSizeAffectsOutput() {
        val text = "Scale test"
        val (smallW, smallH) = measurer.measure(text, 12f, null, Float.MAX_VALUE)
        val (largeW, largeH) = measurer.measure(text, 24f, null, Float.MAX_VALUE)

        assertTrue("24dp text should be wider than 12dp", largeW > smallW)
        assertTrue("24dp text should be taller than 12dp", largeH > smallH)
    }

    @Test
    fun emptyTextReturnsZero() {
        val (w, h) = measurer.measure("", 14f, null, Float.MAX_VALUE)
        assertEquals(0f, w, 0.001f)
        assertEquals(0f, h, 0.001f)
    }
}
