package com.example.renderer

import com.android.ide.common.rendering.api.ILayoutPullParser
import com.android.ide.common.rendering.api.ResourceNamespace
import org.xmlpull.v1.XmlPullParser

/**
 * Minimal [ILayoutPullParser] that describes a single `<FrameLayout />` root.
 *
 * layoutlib's `SessionParams` requires an `ILayoutPullParser` to inflate the
 * initial layout. Since we build Views programmatically, we provide a trivial
 * single-element document so the Bridge creates a root container we can add to.
 */
class EmptyLayoutParser : ILayoutPullParser {

    private enum class State { START_DOC, START_TAG, END_TAG, END_DOC }

    private var state = State.START_DOC

    // --- ILayoutPullParser ---
    override fun getViewCookie(): Any? = null
    override fun getLayoutNamespace(): ResourceNamespace = ResourceNamespace.RES_AUTO

    // --- XmlPullParser ---
    override fun next(): Int {
        state = when (state) {
            State.START_DOC -> State.START_TAG
            State.START_TAG -> State.END_TAG
            State.END_TAG -> State.END_DOC
            State.END_DOC -> State.END_DOC
        }
        return getEventType()
    }

    override fun nextToken(): Int = next()
    override fun nextTag(): Int {
        var evt = next()
        while (evt != XmlPullParser.START_TAG && evt != XmlPullParser.END_TAG && evt != XmlPullParser.END_DOCUMENT) {
            evt = next()
        }
        return evt
    }

    override fun getEventType(): Int = when (state) {
        State.START_DOC -> XmlPullParser.START_DOCUMENT
        State.START_TAG -> XmlPullParser.START_TAG
        State.END_TAG -> XmlPullParser.END_TAG
        State.END_DOC -> XmlPullParser.END_DOCUMENT
    }

    override fun getName(): String? = when (state) {
        State.START_TAG, State.END_TAG -> "FrameLayout"
        else -> null
    }

    override fun getNamespace(): String = ""
    override fun getPrefix(): String? = null
    override fun getDepth(): Int = when (state) {
        State.START_TAG, State.END_TAG -> 1
        else -> 0
    }

    override fun getAttributeCount(): Int = when (state) {
        State.START_TAG -> 2 // layout_width and layout_height
        else -> -1
    }

    override fun getAttributeName(index: Int): String = when (index) {
        0 -> "layout_width"
        1 -> "layout_height"
        else -> ""
    }

    override fun getAttributeNamespace(index: Int): String =
        "http://schemas.android.com/apk/res/android"

    override fun getAttributeValue(index: Int): String = when (index) {
        0, 1 -> "match_parent"
        else -> ""
    }

    override fun getAttributePrefix(index: Int): String = "android"

    override fun getAttributeValue(namespace: String?, name: String?): String? = when (name) {
        "layout_width", "layout_height" -> "match_parent"
        else -> null
    }

    override fun getAttributeType(index: Int): String = "CDATA"
    override fun isAttributeDefault(index: Int): Boolean = false

    // --- Stub implementations for unused XmlPullParser methods ---
    override fun isEmptyElementTag(): Boolean = true
    override fun isWhitespace(): Boolean = false
    override fun getText(): String? = null
    override fun getTextCharacters(holderForStartAndLength: IntArray?): CharArray? = null
    override fun getColumnNumber(): Int = -1
    override fun getLineNumber(): Int = -1
    override fun getInputEncoding(): String? = "UTF-8"
    override fun getProperty(name: String?): Any? = null
    override fun setProperty(name: String?, value: Any?) {}
    override fun getFeature(name: String?): Boolean = false
    override fun setFeature(name: String?, state: Boolean) {}
    override fun setInput(input: java.io.Reader?) {}
    override fun setInput(inputStream: java.io.InputStream?, inputEncoding: String?) {}
    override fun defineEntityReplacementText(entityName: String?, replacementText: String?) {}
    override fun getNamespaceCount(depth: Int): Int = 0
    override fun getNamespacePrefix(pos: Int): String? = null
    override fun getNamespaceUri(pos: Int): String? = null
    override fun getNamespace(prefix: String?): String? = null
    override fun require(type: Int, namespace: String?, name: String?) {}
    override fun nextText(): String = ""
    override fun getPositionDescription(): String = "EmptyLayoutParser"
}
