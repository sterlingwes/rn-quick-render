package com.example.renderer

import org.junit.Assert.*
import org.junit.Test

/**
 * Verifies that layoutlib can be bootstrapped on the host JVM and
 * produce a non-empty render session.
 */
class LayoutlibBootstrapTest {

    @Test
    fun bootstrapCreatesSession() {
        val bootstrap = LayoutlibBootstrap.create()
        assertNotNull(bootstrap.renderSession)
        assertTrue(bootstrap.renderSession.result.isSuccess)
    }

    @Test
    fun sessionProducesImage() {
        val bootstrap = LayoutlibBootstrap.create()
        val result = bootstrap.renderSession.render()
        assertTrue("render() should succeed: ${result.status}", result.isSuccess)
        val image = bootstrap.renderSession.image
        assertNotNull("image should not be null", image)
        assertTrue("image width > 0", image.width > 0)
        assertTrue("image height > 0", image.height > 0)
    }
}
