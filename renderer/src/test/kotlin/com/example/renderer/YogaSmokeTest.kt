package com.example.renderer

import com.facebook.yoga.*
import org.junit.Assert.*
import org.junit.Test

/**
 * Smoke test: verify that the Yoga JNI library loads and basic flex
 * layout works on the host JVM.
 */
class YogaSmokeTest {

    @Test
    fun basicRowLayout() {
        val config = YogaConfigFactory.create()
        val root = YogaNodeFactory.create(config)
        root.setWidth(100f)
        root.setHeight(100f)
        root.setFlexDirection(YogaFlexDirection.ROW)

        val child1 = YogaNodeFactory.create(config)
        child1.setFlexGrow(1f)
        root.addChildAt(child1, 0)

        val child2 = YogaNodeFactory.create(config)
        child2.setFlexGrow(1f)
        root.addChildAt(child2, 1)

        root.calculateLayout(YogaConstants.UNDEFINED, YogaConstants.UNDEFINED)

        assertEquals(100f, root.getLayoutWidth(), 0.001f)
        assertEquals(100f, root.getLayoutHeight(), 0.001f)

        // Two equal-flex children should each get 50px width
        assertEquals(50f, child1.getLayoutWidth(), 0.001f)
        assertEquals(100f, child1.getLayoutHeight(), 0.001f)
        assertEquals(0f, child1.getLayoutX(), 0.001f)

        assertEquals(50f, child2.getLayoutWidth(), 0.001f)
        assertEquals(50f, child2.getLayoutX(), 0.001f)
    }

    @Test
    fun paddingAndMargin() {
        val root = YogaNodeFactory.create()
        root.setWidth(200f)
        root.setHeight(200f)
        root.setPadding(YogaEdge.ALL, 10f)

        val child = YogaNodeFactory.create()
        child.setMargin(YogaEdge.ALL, 5f)
        child.setFlexGrow(1f)
        root.addChildAt(child, 0)

        root.calculateLayout(YogaConstants.UNDEFINED, YogaConstants.UNDEFINED)

        // Child should be inset by padding(10) + margin(5) = 15 on each side
        assertEquals(15f, child.getLayoutX(), 0.001f)
        assertEquals(15f, child.getLayoutY(), 0.001f)
        // Width: 200 - 2*(10+5) = 170
        assertEquals(170f, child.getLayoutWidth(), 0.001f)
        assertEquals(170f, child.getLayoutHeight(), 0.001f)
    }

    @Test
    fun measureFunction() {
        val root = YogaNodeFactory.create()
        root.setWidth(200f)

        root.setAlignItems(YogaAlign.FLEX_START) // don't stretch children

        val leaf = YogaNodeFactory.create()
        leaf.setMeasureFunction(YogaMeasureFunction { _, _, _, _, _ ->
            // Simulate a 80x20 text block
            YogaMeasureOutput.make(80f, 20f)
        })
        root.addChildAt(leaf, 0)

        root.calculateLayout(YogaConstants.UNDEFINED, YogaConstants.UNDEFINED)

        assertEquals(80f, leaf.getLayoutWidth(), 0.001f)
        assertEquals(20f, leaf.getLayoutHeight(), 0.001f)
    }
}
