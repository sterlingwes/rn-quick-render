package com.example.renderer

import com.google.gson.JsonElement
import com.google.gson.JsonObject

/**
 * Flattens an RN `style` prop (object | array | nested array) into a
 * single [JsonObject] using last-wins semantics. Matches what real
 * RN's `StyleSheet.flatten` does: recurses into any array depth so
 * `[{a: 1}, [{b: 2}, [{c: 3}]]]` becomes `{a: 1, b: 2, c: 3}`. A
 * `null` value deletes the key it sits under (so an earlier-merged
 * entry can be removed by a later one).
 *
 * Real RN composes user-supplied style with internal defaults via
 * `StyleSheet.compose`, which can leave the prop as an arbitrarily
 * deep array — `<Text style={[a.text_3xl, a.font_bold]}>` produces
 * a 2-element inner array nested inside the outer composed array
 * the RN Text wrapper builds. The bsky `PasswordUpdatedForm` fixture
 * is the first one to mount that shape; earlier fixtures only
 * shipped flat arrays which let a less-strict flattener pass.
 *
 * Returns `null` when the input collapses to no keys (so callers can
 * skip applying style entirely).
 */
internal object StyleFlattener {
    fun flatten(raw: JsonElement?): JsonObject? {
        if (raw == null || raw.isJsonNull) return null
        if (raw.isJsonObject) return raw.asJsonObject
        if (raw.isJsonArray) {
            val merged = JsonObject()
            collectInto(raw, merged)
            return if (merged.size() == 0) null else merged
        }
        return null
    }

    private fun collectInto(raw: JsonElement, target: JsonObject) {
        if (raw.isJsonNull) return
        if (raw.isJsonObject) {
            for ((k, v) in raw.asJsonObject.entrySet()) {
                if (v.isJsonNull) target.remove(k) else target.add(k, v)
            }
            return
        }
        if (raw.isJsonArray) {
            for (entry in raw.asJsonArray) collectInto(entry, target)
        }
        // Anything else (raw primitive — shouldn't happen for a style
        // prop) is silently ignored, matching RN's permissive
        // behaviour around malformed style entries.
    }
}
