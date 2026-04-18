package com.example.snapshot

import android.graphics.Color
import android.graphics.Typeface
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.constraintlayout.widget.ConstraintLayout
import androidx.constraintlayout.widget.ConstraintSet
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.android.ide.common.rendering.api.SessionParams.RenderingMode
import org.junit.Rule
import org.junit.Test

/**
 * Phase 0 exit criteria: produce reproducible PNG snapshots of TextView, LinearLayout,
 * ConstraintLayout, ImageView on a headless Linux JVM (no emulator in the loop).
 *
 * Run with `./gradlew :snapshots:recordPaparazziDebug` on first execution to populate the
 * golden images under src/test/snapshots/images/, then `:verifyPaparazziDebug` on CI.
 */
class Phase0ViewsTest {

    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = DeviceConfig.PIXEL_5,
        theme = "android:Theme.Material.Light.NoActionBar",
        renderingMode = RenderingMode.SHRINK,
    )

    @Test
    fun textView_basic() {
        val view = TextView(paparazzi.context).apply {
            text = "Hello from Paparazzi"
            textSize = 20f
            setTextColor(Color.parseColor("#1A1A1A"))
            setPadding(dp(24), dp(24), dp(24), dp(24))
            setTypeface(typeface, Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)
        }
        paparazzi.snapshot(view)
    }

    @Test
    fun linearLayout_verticalStack() {
        val root = LinearLayout(paparazzi.context).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#F5F5F5"))
            setPadding(dp(16), dp(16), dp(16), dp(16))
            layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)
        }
        root.addView(
            TextView(paparazzi.context).apply {
                text = "Headline"
                textSize = 24f
                setTextColor(Color.parseColor("#1A1A1A"))
            },
        )
        root.addView(
            TextView(paparazzi.context).apply {
                text = "Subline — rendered without an emulator."
                textSize = 14f
                setTextColor(Color.parseColor("#666666"))
                setPadding(0, dp(4), 0, 0)
            },
        )
        paparazzi.snapshot(root)
    }

    @Test
    fun constraintLayout_twoAnchoredChildren() {
        val context = paparazzi.context
        val root = ConstraintLayout(context).apply {
            setBackgroundColor(Color.WHITE)
            layoutParams = ConstraintLayout.LayoutParams(MATCH_PARENT, dp(200))
        }

        val primary = TextView(context).apply {
            id = View.generateViewId()
            text = "Top-left"
            setPadding(dp(12), dp(8), dp(12), dp(8))
            setBackgroundColor(Color.parseColor("#3F51B5"))
            setTextColor(Color.WHITE)
        }
        val accent = TextView(context).apply {
            id = View.generateViewId()
            text = "Bottom-right"
            setPadding(dp(12), dp(8), dp(12), dp(8))
            setBackgroundColor(Color.parseColor("#E91E63"))
            setTextColor(Color.WHITE)
        }
        root.addView(primary, ConstraintLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT))
        root.addView(accent, ConstraintLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT))

        val set = ConstraintSet()
        set.clone(root)
        set.connect(primary.id, ConstraintSet.TOP, ConstraintSet.PARENT_ID, ConstraintSet.TOP, dp(16))
        set.connect(primary.id, ConstraintSet.START, ConstraintSet.PARENT_ID, ConstraintSet.START, dp(16))
        set.connect(accent.id, ConstraintSet.BOTTOM, ConstraintSet.PARENT_ID, ConstraintSet.BOTTOM, dp(16))
        set.connect(accent.id, ConstraintSet.END, ConstraintSet.PARENT_ID, ConstraintSet.END, dp(16))
        set.applyTo(root)

        paparazzi.snapshot(root)
    }

    @Test
    fun imageView_vectorDrawable() {
        val view = ImageView(paparazzi.context).apply {
            setImageResource(R.drawable.phase0_swatch)
            setBackgroundColor(Color.parseColor("#F5F5F5"))
            setPadding(dp(24), dp(24), dp(24), dp(24))
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, dp(160)).apply {
                gravity = Gravity.CENTER
            }
        }
        paparazzi.snapshot(view)
    }

    private fun dp(value: Int): Int =
        (value * paparazzi.context.resources.displayMetrics.density).toInt()
}
