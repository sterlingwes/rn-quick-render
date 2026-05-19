package com.example.renderer

/**
 * Hardware configuration the renderer should target for a snapshot.
 *
 * Layoutlib expects pixels and a dpi; React Native + Yoga work in dp
 * (px ÷ density). One `DeviceProfile` carries both. Construct once
 * per device class you want in the matrix; the renderer reads
 * [widthPx] / [heightPx] / [densityDpi] directly.
 *
 * The committed profiles are picked to span the realistic Android
 * size envelope without overlapping:
 *
 * | Profile     | Px         | dpi | Dp        | Models    |
 * | ---         | ---        | --- | ---       | ---       |
 * | SMALL_PHONE | 720×1280   | 320 | 360×640   | Pixel 4a-era budget |
 * | PIXEL_5     | 1080×2340  | 440 | 393×851   | Pixel 5 / 6 / 7 default |
 * | PIXEL_7_PRO | 1440×3120  | 560 | 411×891   | High-density flagship |
 * | TABLET      | 1600×2560  | 276 | 928×1484  | 11" tablet at low ppi |
 *
 * These cover the dp-width buckets RN's `useBreakpoints()` tends to
 * branch on (≤ 400 / ≤ 600 / ≤ 800 / > 800), so a single fixture's
 * matrix render is enough to surface most breakpoint regressions.
 */
data class DeviceProfile(
    val name: String,
    val widthPx: Int,
    val heightPx: Int,
    val densityDpi: Int,
) {
    val widthDp: Int get() = (widthPx / (densityDpi / 160f)).toInt()
    val heightDp: Int get() = (heightPx / (densityDpi / 160f)).toInt()

    companion object {
        val SMALL_PHONE = DeviceProfile("smallPhone", 720, 1280, 320)
        val PIXEL_5 = DeviceProfile("pixel5", 1080, 2340, 440)
        val PIXEL_7_PRO = DeviceProfile("pixel7Pro", 1440, 3120, 560)
        val TABLET = DeviceProfile("tablet", 1600, 2560, 276)

        val ALL: List<DeviceProfile> = listOf(SMALL_PHONE, PIXEL_5, PIXEL_7_PRO, TABLET)
    }
}
