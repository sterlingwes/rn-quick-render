package com.example.renderer

import com.android.ide.common.rendering.api.ILayoutLog

/**
 * Simple [ILayoutLog] that prints warnings and errors to stderr.
 */
object StderrLayoutLog : ILayoutLog {

    override fun warning(tag: String?, message: String?, viewCookie: Any?, data: Any?) {
        System.err.println("[layoutlib WARN] $tag: $message")
    }

    override fun fidelityWarning(
        tag: String?,
        message: String?,
        throwable: Throwable?,
        viewCookie: Any?,
        data: Any?,
    ) {
        System.err.println("[layoutlib FIDELITY] $tag: $message")
    }

    override fun error(tag: String?, message: String?, viewCookie: Any?, data: Any?) {
        System.err.println("[layoutlib ERROR] $tag: $message")
    }

    override fun error(
        tag: String?,
        message: String?,
        throwable: Throwable?,
        viewCookie: Any?,
        data: Any?,
    ) {
        System.err.println("[layoutlib ERROR] $tag: $message")
        throwable?.printStackTrace(System.err)
    }

    override fun logAndroidFramework(priority: Int, tag: String?, message: String?) {
        // Suppress verbose Android framework logs
    }
}
