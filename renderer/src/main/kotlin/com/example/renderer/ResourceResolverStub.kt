package com.example.renderer

import com.android.ide.common.rendering.api.*
import com.android.resources.ResourceType

/**
 * [RenderResources] backed by parsed framework resources from layoutlib-resources.
 *
 * Provides a Material theme and resolves framework resource references
 * (dimens, bools, colors, styles, etc.) needed by View constructors during
 * session creation. Project resource lookups return null since we build
 * Views programmatically.
 */
class ResourceResolverStub(
    private val frameworkResources: FrameworkResourceLoader,
) : RenderResources() {

    private val defaultTheme: StyleResourceValue =
        frameworkResources.getStyle("Theme.Material.Light.NoActionBar")
            ?: StyleResourceValueImpl(
                ResourceNamespace.ANDROID,
                "Theme.Material.Light.NoActionBar",
                "Theme.Material.Light",
                null,
            )

    override fun getDefaultTheme(): StyleResourceValue = defaultTheme

    override fun applyStyle(theme: StyleResourceValue?, useAsPrimary: Boolean) {}
    override fun clearStyles() {}

    override fun getAllThemes(): List<StyleResourceValue> = listOf(defaultTheme)

    override fun findItemInTheme(attr: ResourceReference?): ResourceValue? {
        if (attr == null) return null
        return findItemInStyle(defaultTheme, attr)
    }

    override fun findItemInStyle(
        style: StyleResourceValue?,
        attr: ResourceReference?,
    ): ResourceValue? {
        if (style == null || attr == null) return null
        // Look in this style's items
        val item = style.getItem(attr.namespace, attr.name)
        if (item != null) return item
        // Walk up the parent chain
        val parent = getParent(style)
        if (parent != null) return findItemInStyle(parent, attr)
        return null
    }

    override fun getParent(style: StyleResourceValue?): StyleResourceValue? {
        if (style == null) return null
        val parentName = style.parentStyleName ?: return null
        val cleanName = parentName.removePrefix("@android:style/").removePrefix("@style/")
            .replace('/', '.')
        return frameworkResources.getStyle(cleanName)
    }

    override fun getResolvedResource(reference: ResourceReference?): ResourceValue? {
        if (reference == null) return null
        return frameworkResources.getResolvedResource(reference)
    }

    override fun getUnresolvedResource(reference: ResourceReference?): ResourceValue? {
        return getResolvedResource(reference)
    }

    override fun resolveResValue(value: ResourceValue?): ResourceValue? {
        if (value == null) return null
        val v = value.value ?: return value
        // Resolve @-references
        if (v.startsWith("@")) {
            val resolved = resolveReference(v)
            if (resolved != null) return resolved
        }
        return value
    }

    override fun getStyle(reference: ResourceReference?): StyleResourceValue? {
        if (reference == null) return null
        return frameworkResources.getStyle(reference.name)
    }

    override fun dereference(value: ResourceValue?): ResourceValue? {
        if (value == null) return value
        val v = value.value ?: return value
        if (v.startsWith("@")) {
            return resolveReference(v)
        }
        return value
    }

    private fun resolveReference(ref: String): ResourceValue? {
        // Parse @android:type/name or @type/name
        val cleaned = ref.removePrefix("@")
        val isFramework = cleaned.startsWith("android:")
        val withoutNs = cleaned.removePrefix("android:")
        val slash = withoutNs.indexOf('/')
        if (slash <= 0) return null
        val typeName = withoutNs.substring(0, slash)
        val resName = withoutNs.substring(slash + 1)
        val type = ResourceType.fromClassName(typeName) ?: return null
        if (!isFramework) return null // Only framework resources
        val namespace = ResourceNamespace.ANDROID
        return frameworkResources.getResolvedResource(
            ResourceReference(namespace, type, resName)
        )
    }
}
