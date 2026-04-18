package com.example.snapshot

import android.graphics.Color
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.LinearLayout
import android.widget.TextView
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import org.junit.AfterClass
import org.junit.Rule
import org.junit.Test
import java.io.File

/**
 * Phase 0 perf harness.
 *
 * Reports, for the low-end Linux target (4 vCPU / 8 GB RAM spec):
 *   - Cold-start latency: wall-clock time from JVM up to first completed Paparazzi.snapshot()
 *   - Per-snapshot render time: median / p95 across N warm renders
 *   - Peak RSS delta: VmRSS after snapshots minus VmRSS before Paparazzi boot
 *
 * Metrics are written to `build/phase0-metrics.json` for CI consumption.
 */
class Phase0PerfHarness {

    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_5)

    @Test
    fun warmRenderLoop() {
        val rssBeforeKb = readVmRssKb()
        val timings = LongArray(ITERATIONS)

        for (i in 0 until ITERATIONS) {
            val view = buildProbeView(label = "iteration #$i")
            val start = System.nanoTime()
            paparazzi.snapshot(view, name = "perf_$i")
            timings[i] = System.nanoTime() - start
            if (jvmToFirstSnapshotMs < 0) {
                jvmToFirstSnapshotMs = System.currentTimeMillis() - classLoadEpochMs
            }
        }

        val rssAfterKb = readVmRssKb()
        snapshotNs = timings
        rssBeforeKbRecorded = rssBeforeKb
        rssAfterKbRecorded = rssAfterKb
    }

    private fun buildProbeView(label: String): LinearLayout {
        val ctx = paparazzi.context
        val density = ctx.resources.displayMetrics.density
        fun dp(value: Int) = (value * density).toInt()
        return LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(16))
            setBackgroundColor(Color.parseColor("#F5F5F5"))
            layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)
            addView(
                TextView(ctx).apply {
                    text = label
                    textSize = 16f
                    setTextColor(Color.parseColor("#1A1A1A"))
                },
            )
        }
    }

    companion object {
        private const val ITERATIONS = 5

        // Captured at class load. Gradle forks a fresh JVM per test class,
        // so this is a faithful stand-in for "JVM start" without needing
        // java.lang.management (which AGP hides from the unit-test classpath
        // because android.jar doesn't include the java.management module).
        @JvmStatic
        private val classLoadEpochMs: Long = System.currentTimeMillis()

        @JvmStatic
        private var jvmToFirstSnapshotMs = -1L

        @JvmStatic
        private var snapshotNs: LongArray = LongArray(0)

        @JvmStatic
        private var rssBeforeKbRecorded = -1L

        @JvmStatic
        private var rssAfterKbRecorded = -1L

        @AfterClass
        @JvmStatic
        fun writeMetrics() {
            val sorted = snapshotNs.sortedArray()
            val median = if (sorted.isEmpty()) 0L else sorted[sorted.size / 2]
            val p95Index = if (sorted.isEmpty()) 0 else ((sorted.size - 1) * 0.95).toInt()
            val p95 = if (sorted.isEmpty()) 0L else sorted[p95Index]
            val total = snapshotNs.sum()
            val json = buildString {
                append("{\n")
                append("  \"jvm_to_first_snapshot_ms\": ").append(jvmToFirstSnapshotMs).append(",\n")
                append("  \"iterations\": ").append(snapshotNs.size).append(",\n")
                append("  \"per_snapshot_ms\": {\n")
                append("    \"min\": ").append((sorted.firstOrNull() ?: 0L) / 1_000_000L).append(",\n")
                append("    \"median\": ").append(median / 1_000_000L).append(",\n")
                append("    \"p95\": ").append(p95 / 1_000_000L).append(",\n")
                append("    \"max\": ").append((sorted.lastOrNull() ?: 0L) / 1_000_000L).append(",\n")
                append("    \"total\": ").append(total / 1_000_000L).append("\n")
                append("  },\n")
                append("  \"rss_kb\": {\n")
                append("    \"before\": ").append(rssBeforeKbRecorded).append(",\n")
                append("    \"after\": ").append(rssAfterKbRecorded).append(",\n")
                append("    \"delta\": ").append(rssAfterKbRecorded - rssBeforeKbRecorded).append("\n")
                append("  }\n")
                append("}\n")
            }
            val outDir = File("build").also { it.mkdirs() }
            File(outDir, "phase0-metrics.json").writeText(json)
            println("=== Phase 0 metrics ===")
            println(json)
        }

        private fun readVmRssKb(): Long {
            val status = File("/proc/self/status")
            if (!status.canRead()) return -1L
            status.useLines { lines ->
                for (line in lines) {
                    if (line.startsWith("VmRSS:")) {
                        return line.removePrefix("VmRSS:").trim().removeSuffix(" kB").toLongOrNull() ?: -1L
                    }
                }
            }
            return -1L
        }
    }
}
