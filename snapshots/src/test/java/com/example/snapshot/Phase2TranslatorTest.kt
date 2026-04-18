package com.example.snapshot

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.android.ide.common.rendering.api.SessionParams.RenderingMode
import org.junit.Rule
import org.junit.Test
import java.io.File

/**
 * Phase 2: drive the [FabricTranslator] end-to-end, rendering each captured
 * fixture through Paparazzi. The harness JSON lives in `../rn-harness/out/`
 * (the Phase 1 goldens) and the Yoga-computed layout alongside it.
 *
 * Golden PNGs land in `snapshots/src/test/snapshots/images/` and are the
 * Phase 2 visual goldens — committed and verified on CI exactly like the
 * Phase 0 probes.
 */
class Phase2TranslatorTest {

    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = DeviceConfig.PIXEL_5,
        theme = "android:Theme.Material.Light.NoActionBar",
        renderingMode = RenderingMode.SHRINK,
    )

    @Test fun simpleView() = snapshotFixture("simpleView")
    @Test fun nestedViews() = snapshotFixture("nestedViews")
    @Test fun textAndImage() = snapshotFixture("textAndImage")
    @Test fun scrollView() = snapshotFixture("scrollView")
    @Test fun conditional() = snapshotFixture("conditional")

    private fun snapshotFixture(name: String) {
        val harness = File(System.getProperty("user.dir"), "../rn-harness/out")
        val instructions = File(harness, "$name.json")
        val layout = File(harness, "$name.layout.json")
        require(instructions.exists()) { "Missing capture: ${instructions.absolutePath}. Run `npm --prefix rn-harness run capture`." }
        require(layout.exists()) { "Missing layout: ${layout.absolutePath}. Run `npm --prefix rn-harness run layout`." }

        val translator = FabricTranslator(paparazzi.context)
        val view = translator.translateFromFiles(instructions, layout)
        paparazzi.snapshot(view, name = name)
    }
}
