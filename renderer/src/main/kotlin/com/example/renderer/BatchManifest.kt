package com.example.renderer

import com.google.gson.JsonParser
import java.io.File

/**
 * Batch-mode manifest. One JSON file describes N independent
 * renders that should share a single JVM + bootstrap cache.
 *
 * The CLI's `--batch <manifest.json>` flag reads this format and
 * fans the entries out across one warm JVM, amortising the ~4 s
 * `Bridge.init()` cost across however many renders the manifest
 * asks for. Bootstraps are cached per [DeviceProfile] so a
 * 40-entry matrix run pays init at most 4× (once per device class).
 *
 * Format:
 * ```json
 * {
 *   "fonts": "path/to/fonts",
 *   "entries": [
 *     {
 *       "input": "path/to/fixture.json",
 *       "output": "path/to/render.png",
 *       "device": "pixel5",
 *       "fontScale": "default"
 *     }
 *   ]
 * }
 * ```
 *
 * - `device` and `fontScale` are looked up by name in
 *   [DeviceProfile.ALL] / [FontScale.ALL]. The named-profile
 *   approach is more ergonomic than raw px/dpi numbers, and
 *   keeps manifest entries comparable to matrix-test output
 *   filenames. Ad-hoc dimensions can be added later if needed.
 * - `fonts` is optional and may be set at the manifest level
 *   (default for every entry) or per-entry (overrides the
 *   default). Resolves to a [FontRegistry], cached by directory
 *   path across entries.
 * - `fontScale` defaults to `"default"` (1.0×) when omitted.
 * - Output directories are created if missing.
 */
data class BatchManifest(
    val fonts: String? = null,
    val entries: List<BatchEntry>,
)

data class BatchEntry(
    val input: String,
    val output: String,
    val device: String,
    val fontScale: String = "default",
    val fonts: String? = null,
)

object BatchManifestParser {
    fun parse(file: File): BatchManifest {
        require(file.exists()) { "Batch manifest not found: ${file.absolutePath}" }
        val root = JsonParser.parseString(file.readText()).asJsonObject

        val fonts = root.get("fonts")?.takeIf { it.isJsonPrimitive }?.asString
        val entriesElement = root.get("entries")
            ?: error("Batch manifest is missing required `entries` array: ${file.absolutePath}")
        val entriesArray = entriesElement.asJsonArray

        val entries = entriesArray.mapIndexed { i, e ->
            val obj = e.asJsonObject
            BatchEntry(
                input = obj.get("input")?.asString
                    ?: error("Batch manifest entry $i is missing required `input` field"),
                output = obj.get("output")?.asString
                    ?: error("Batch manifest entry $i is missing required `output` field"),
                device = obj.get("device")?.asString
                    ?: error("Batch manifest entry $i is missing required `device` field"),
                fontScale = obj.get("fontScale")?.asString ?: "default",
                fonts = obj.get("fonts")?.takeIf { it.isJsonPrimitive }?.asString,
            )
        }

        require(entries.isNotEmpty()) {
            "Batch manifest has no entries: ${file.absolutePath}"
        }
        return BatchManifest(fonts = fonts, entries = entries)
    }
}

object BatchLookup {
    private val DEVICES_BY_NAME: Map<String, DeviceProfile> =
        DeviceProfile.ALL.associateBy { it.name }
    private val FONT_SCALES_BY_NAME: Map<String, FontScale> =
        FontScale.ALL.associateBy { it.name }

    fun device(name: String): DeviceProfile =
        DEVICES_BY_NAME[name] ?: error(
            "Unknown device profile: \"$name\". Known: ${DEVICES_BY_NAME.keys.sorted()}"
        )

    fun fontScale(name: String): FontScale =
        FONT_SCALES_BY_NAME[name] ?: error(
            "Unknown font scale: \"$name\". Known: ${FONT_SCALES_BY_NAME.keys.sorted()}"
        )
}
