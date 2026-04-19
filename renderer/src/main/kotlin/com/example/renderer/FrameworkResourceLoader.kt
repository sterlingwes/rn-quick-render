package com.example.renderer

import com.android.ide.common.rendering.api.ResourceNamespace
import com.android.ide.common.rendering.api.ResourceReference
import com.android.ide.common.rendering.api.ResourceValue
import com.android.ide.common.rendering.api.ResourceValueImpl
import com.android.ide.common.rendering.api.StyleItemResourceValueImpl
import com.android.ide.common.rendering.api.StyleResourceValue
import com.android.ide.common.rendering.api.StyleResourceValueImpl
import com.android.resources.ResourceType
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory

/**
 * Loads Android framework resource values from the layoutlib-resources res directory.
 *
 * Parses values XML files to build lookup tables for dimens, bools, colors,
 * integers, strings, and styles that the bridge needs during session creation.
 */
class FrameworkResourceLoader private constructor(
    private val resources: Map<ResourceType, Map<String, ResourceValue>>,
    private val styles: Map<String, StyleResourceValue>,
) {

    fun getResource(type: ResourceType, name: String): ResourceValue? =
        resources[type]?.get(name)

    fun getStyle(name: String): StyleResourceValue? = styles[name]

    fun getResolvedResource(ref: ResourceReference): ResourceValue? {
        if (ref.resourceType == ResourceType.STYLE) {
            return styles[ref.name]
        }
        return resources[ref.resourceType]?.get(ref.name)
    }

    companion object {
        private val SKIP_TAGS = setOf(
            "declare-styleable", "attr", "public", "java-symbol",
            "eat-comment", "overlayable", "staging-public-group",
            "staging-public-group-final",
        )

        private val SIMPLE_TAG_TYPES = mapOf(
            "dimen" to ResourceType.DIMEN,
            "bool" to ResourceType.BOOL,
            "color" to ResourceType.COLOR,
            "integer" to ResourceType.INTEGER,
            "string" to ResourceType.STRING,
            "drawable" to ResourceType.DRAWABLE,
            "fraction" to ResourceType.FRACTION,
            "plurals" to ResourceType.PLURALS,
            "id" to ResourceType.ID,
        )

        fun load(resDir: File): FrameworkResourceLoader {
            val resources = mutableMapOf<ResourceType, MutableMap<String, ResourceValue>>()
            val styles = mutableMapOf<String, StyleResourceValue>()

            val valuesDir = resDir.resolve("values")
            if (!valuesDir.isDirectory) {
                return FrameworkResourceLoader(resources, styles)
            }

            val factory = DocumentBuilderFactory.newInstance()
            factory.isNamespaceAware = false

            val xmlFiles = valuesDir.listFiles()?.filter { it.extension == "xml" } ?: emptyList()
            for (file in xmlFiles) {
                try {
                    parseResourceFile(factory, file, resources, styles)
                } catch (_: Exception) {
                    // Skip unparseable files
                }
            }

            return FrameworkResourceLoader(resources, styles)
        }

        private fun parseResourceFile(
            factory: DocumentBuilderFactory,
            file: File,
            resources: MutableMap<ResourceType, MutableMap<String, ResourceValue>>,
            styles: MutableMap<String, StyleResourceValue>,
        ) {
            val doc = factory.newDocumentBuilder().parse(file)
            val root = doc.documentElement ?: return

            val children = root.childNodes
            for (i in 0 until children.length) {
                val node = children.item(i)
                if (node.nodeType != org.w3c.dom.Node.ELEMENT_NODE) {
                    // not an element
                } else {
                    processElement(node as org.w3c.dom.Element, resources, styles)
                }
            }
        }

        private fun processElement(
            element: org.w3c.dom.Element,
            resources: MutableMap<ResourceType, MutableMap<String, ResourceValue>>,
            styles: MutableMap<String, StyleResourceValue>,
        ) {
            val tagName = element.tagName
            val name = element.getAttribute("name")
            if (name.isNullOrEmpty()) return
            if (SKIP_TAGS.contains(tagName)) return

            if (tagName == "style") {
                processStyle(element, name, resources, styles)
                return
            }

            if (tagName == "item") {
                processTypedItem(element, name, resources)
                return
            }

            if (tagName == "array" || tagName == "string-array" || tagName == "integer-array") {
                addResource(resources, ResourceType.ARRAY, name, "")
                return
            }

            val type = SIMPLE_TAG_TYPES[tagName]
                ?: ResourceType.fromClassName(tagName)
            if (type != null) {
                val value = element.textContent?.trim() ?: ""
                addResource(resources, type, name, value)
            }
        }

        private fun processStyle(
            element: org.w3c.dom.Element,
            name: String,
            resources: MutableMap<ResourceType, MutableMap<String, ResourceValue>>,
            styles: MutableMap<String, StyleResourceValue>,
        ) {
            val parentAttr = element.getAttribute("parent") ?: ""
            val parent = parentAttr.ifEmpty { inferParentFromName(name) }
            val style = StyleResourceValueImpl(
                ResourceNamespace.ANDROID, name, parent, null,
            )

            val items = element.childNodes
            for (j in 0 until items.length) {
                val itemNode = items.item(j)
                if (itemNode.nodeType != org.w3c.dom.Node.ELEMENT_NODE) {
                    // skip non-elements
                } else {
                    val itemElement = itemNode as org.w3c.dom.Element
                    if (itemElement.tagName == "item") {
                        val itemName = itemElement.getAttribute("name")
                        if (!itemName.isNullOrEmpty()) {
                            val itemValue = itemElement.textContent?.trim() ?: ""
                            val attrRef = parseAttrReference(itemName)
                            val styleItem = StyleItemResourceValueImpl(
                                attrRef.namespace, attrRef.name, itemValue, null,
                            )
                            style.addItem(styleItem)
                        }
                    }
                }
            }

            styles[name] = style
            resources.getOrPut(ResourceType.STYLE) { mutableMapOf() }[name] = style
        }

        private fun processTypedItem(
            element: org.w3c.dom.Element,
            name: String,
            resources: MutableMap<ResourceType, MutableMap<String, ResourceValue>>,
        ) {
            val typeAttr = element.getAttribute("type")
            if (typeAttr.isNullOrEmpty()) return
            val type = ResourceType.fromClassName(typeAttr) ?: return
            val value = element.textContent?.trim() ?: ""
            addResource(resources, type, name, value)
        }

        private fun addResource(
            resources: MutableMap<ResourceType, MutableMap<String, ResourceValue>>,
            type: ResourceType,
            name: String,
            value: String,
        ) {
            val rv = ResourceValueImpl(ResourceNamespace.ANDROID, type, name, value)
            resources.getOrPut(type) { mutableMapOf() }[name] = rv
        }

        private fun inferParentFromName(name: String): String? {
            val lastDot = name.lastIndexOf('.')
            return if (lastDot > 0) name.substring(0, lastDot) else null
        }

        private fun parseAttrReference(name: String): ResourceReference {
            val isFramework = name.startsWith("android:")
            val ns = if (isFramework) ResourceNamespace.ANDROID else ResourceNamespace.RES_AUTO
            val attrName = if (isFramework) name.removePrefix("android:") else name
            return ResourceReference(ns, ResourceType.ATTR, attrName)
        }
    }
}
