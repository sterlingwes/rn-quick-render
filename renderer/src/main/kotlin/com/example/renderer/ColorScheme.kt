package com.example.renderer

/**
 * Platform-level color-scheme values matching React Native's
 * `useColorScheme()` return type (`'light' | 'dark' | null`).
 *
 * Unlike [DeviceProfile] and [FontScale], the renderer doesn't
 * actually consume this enum — color scheme affects the *captured*
 * mount-instruction stream (different colors land in props), not
 * the way the renderer interprets that stream. The harness's
 * `setColorScheme()` (in `loadRealRn.ts`) is where the override
 * lands; this enum exists so the Kotlin matrix test can pick which
 * pre-captured JSON variant to render and emit a matching golden
 * file suffix.
 */
data class ColorScheme(val name: String, val captureSuffix: String) {
    companion object {
        /** Default `useColorScheme()='light'` — captured without a suffix. */
        val LIGHT = ColorScheme("light", "")
        /** `useColorScheme()='dark'` — captured to `<fixture>__dark.json`. */
        val DARK = ColorScheme("dark", "__dark")

        val ALL: List<ColorScheme> = listOf(LIGHT, DARK)
    }
}
