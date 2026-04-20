package com.example.renderer

import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import org.junit.Assert.*
import org.junit.BeforeClass
import org.junit.Test
import java.io.File

/**
 * Verifies that [FabricViewBuilder] produces correct Android View trees
 * from Fabric mount instructions + Yoga layout.
 */
class FabricViewBuilderTest {

    companion object {
        private lateinit var bootstrap: LayoutlibBootstrap

        @JvmStatic
        @BeforeClass
        fun setup() {
            bootstrap = LayoutlibBootstrap.create()
        }
    }

    @Test
    fun buildSimpleView() {
        val json = File("../rn-harness/out/simpleView.json").readText()
        val engine = YogaLayoutEngine()
        val layout = engine.computeLayout(json)

        bootstrap.executeInSession { context ->
            val builder = FabricViewBuilder(context, density = 2.625f)
            val view = builder.build(json, layout)

            assertNotNull(view)
            assertTrue("root should be a ViewGroup", view is ViewGroup)
            val lp = view.layoutParams as FrameLayout.LayoutParams
            assertTrue("width should be > 0", lp.width > 0)
            assertTrue("height should be > 0", lp.height > 0)
        }
    }

    @Test
    fun buildTextAndImage() {
        val json = File("../rn-harness/out/textAndImage.json").readText()
        val engine = YogaLayoutEngine()
        val layout = engine.computeLayout(json)

        bootstrap.executeInSession { context ->
            val builder = FabricViewBuilder(context, density = 2.625f)
            val view = builder.build(json, layout)

            assertNotNull(view)
            assertTrue("root should be a ViewGroup", view is ViewGroup)
            val root = view as ViewGroup
            assertTrue("root should have children", root.childCount > 0)

            // Walk the tree to find TextViews
            val textViews = mutableListOf<TextView>()
            fun walk(v: View) {
                if (v is TextView) textViews.add(v)
                if (v is ViewGroup) {
                    for (i in 0 until v.childCount) walk(v.getChildAt(i))
                }
            }
            walk(root)
            assertTrue("should contain at least one TextView", textViews.isNotEmpty())
            assertTrue("should have a 'Headline' text",
                textViews.any { it.text.toString() == "Headline" })
        }
    }
}
