package com.example.renderer

/**
 * Curated text scale multipliers that bracket the OS-level font-size
 * settings on iOS and Android. Used by the matrix test to stress-test
 * a fixture's layout under realistic system text-size variation.
 *
 * Why these specific buckets:
 *
 * | Bucket          | Scale  | Matches |
 * | ---             | ---    | --- |
 * | COMPACT         | 0.85x  | Android "Small" / iOS xSmall / iOS Small bracket |
 * | DEFAULT         | 1.00x  | Both OSes' factory default (Android "Default", iOS Large) |
 * | LARGE           | 1.30x  | Android "Largest" — top of the stock Android range; iOS xxxLarge |
 * | ACCESSIBILITY   | 2.00x  | iOS Dynamic Type Accessibility mid-range (AX2–AX3); represents users on a11y text settings |
 * | ACCESSIBILITY_MAX | 3.10x | iOS AX5 — the extreme end where most layouts visibly break |
 *
 * Android's stock "Font size" slider tops out around 1.30x; iOS
 * Dynamic Type Accessibility goes much further (up to ~3.12x at
 * AX5). The matrix biases toward iOS's wider range because it's
 * where useful breakage shows up — any layout that survives
 * iOS AX5 will be fine on Android's narrower stock range.
 *
 * One bucket per [FontScale] entry keeps the matrix predictable and
 * the goldens small. If a future fixture needs intermediate
 * coverage (e.g. iOS xxLarge at 1.23x), add a new entry rather than
 * varying the existing ones — changing a bucket's scale silently
 * invalidates committed goldens.
 */
data class FontScale(val name: String, val scale: Float) {
    companion object {
        val COMPACT = FontScale("compact", 0.85f)
        val DEFAULT = FontScale("default", 1.0f)
        val LARGE = FontScale("large", 1.30f)
        val ACCESSIBILITY = FontScale("a11y", 2.0f)
        val ACCESSIBILITY_MAX = FontScale("a11yMax", 3.10f)

        val ALL: List<FontScale> = listOf(
            COMPACT, DEFAULT, LARGE, ACCESSIBILITY, ACCESSIBILITY_MAX,
        )
    }
}
