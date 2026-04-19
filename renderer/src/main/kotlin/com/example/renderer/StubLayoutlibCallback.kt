package com.example.renderer

import com.android.ide.common.rendering.api.*
import org.xmlpull.v1.XmlPullParser

/**
 * Minimal [LayoutlibCallback] for programmatic View rendering.
 *
 * Since we construct Views in code (not from XML), most callback methods
 * are never invoked. The ones that are needed (`loadView`) delegate to
 * standard Java reflection.
 */
class StubLayoutlibCallback : LayoutlibCallback() {

    override fun loadView(
        name: String,
        constructorSignature: Array<Class<*>>,
        constructorArgs: Array<Any>,
    ): Any {
        val clazz = Class.forName(name)
        val ctor = clazz.getConstructor(*constructorSignature)
        return ctor.newInstance(*constructorArgs)
    }

    override fun resolveResourceId(id: Int): ResourceReference? = null

    override fun getOrGenerateResourceId(resource: ResourceReference): Int = 0

    override fun getParser(layoutResource: ResourceValue): ILayoutPullParser? = null

    override fun getAdapterBinding(
        viewObject: Any,
        attributes: Map<String, String>,
    ): AdapterBinding? = null

    override fun getActionBarCallback(): ActionBarCallback = ActionBarCallback()

    // XmlParserFactory interface
    override fun createXmlParserForPsiFile(fileName: String): XmlPullParser? = null
    override fun createXmlParserForFile(fileName: String): XmlPullParser? = null
    override fun createXmlParser(): XmlPullParser? = null
}
