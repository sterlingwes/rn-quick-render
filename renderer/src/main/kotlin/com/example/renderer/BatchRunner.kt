package com.example.renderer

import java.io.File
import javax.imageio.ImageIO

/**
 * Reads a [BatchManifest] and executes every entry against a
 * single warm JVM. Bootstraps are cached per-[DeviceProfile] and
 * font registries per directory path, so init costs are paid at
 * most once per distinct (device, fonts) combination instead of
 * per entry.
 *
 * Prints a one-line progress entry per render including the
 * device + font-scale label and elapsed ms, plus a footer with
 * cumulative timing split into init vs. render time. Returns
 * non-zero exit status from [Main] if any entry fails (renders
 * still write what they can to disk; the runner doesn't abort
 * on the first failure).
 */
object BatchRunner {

    data class RunResult(val total: Int, val failed: Int)

    fun run(manifest: BatchManifest): RunResult {
        val bootstraps = mutableMapOf<DeviceProfile, LayoutlibBootstrap>()
        val fontRegistries = mutableMapOf<String, FontRegistry>()
        val defaultFonts = manifest.fonts

        val totalStart = System.currentTimeMillis()
        var initMs = 0L
        var renderMs = 0L
        var failed = 0

        for ((index, entry) in manifest.entries.withIndex()) {
            val tag = "[${index + 1}/${manifest.entries.size}]"
            try {
                val device = BatchLookup.device(entry.device)
                val fontScale = BatchLookup.fontScale(entry.fontScale)
                val fontsPath = entry.fonts ?: defaultFonts

                val bootstrap = bootstraps[device] ?: run {
                    val t0 = System.currentTimeMillis()
                    val b = LayoutlibBootstrap.create(
                        device.widthPx, device.heightPx, device.densityDpi,
                    )
                    initMs += System.currentTimeMillis() - t0
                    bootstraps[device] = b
                    b
                }

                val fontRegistry = if (fontsPath != null) {
                    fontRegistries.getOrPut(fontsPath) { loadFontsFromDirectory(File(fontsPath)) }
                } else {
                    FontRegistry.EMPTY
                }

                val renderer = SnapshotRenderer(
                    bootstrap,
                    screenWidth = device.widthPx,
                    screenHeight = device.heightPx,
                    densityDpi = device.densityDpi,
                    fontRegistry = fontRegistry,
                    fontScale = fontScale.scale,
                )
                val json = File(entry.input).readText()

                val t0 = System.currentTimeMillis()
                val image = renderer.render(json)
                val elapsed = System.currentTimeMillis() - t0
                renderMs += elapsed

                val outFile = File(entry.output)
                outFile.parentFile?.mkdirs()
                ImageIO.write(image, "png", outFile)

                println(
                    "$tag ${entry.input} → ${entry.output} " +
                        "(${device.name} @ ${fontScale.name}, ${elapsed} ms)"
                )
            } catch (t: Throwable) {
                failed++
                System.err.println("$tag FAILED ${entry.input}: ${t.message}")
            }
        }

        val totalMs = System.currentTimeMillis() - totalStart
        println(
            "Batch done: ${manifest.entries.size - failed}/${manifest.entries.size} ok, " +
                "${bootstraps.size} bootstrap${if (bootstraps.size == 1) "" else "s"}, " +
                "init ${initMs} ms + render ${renderMs} ms = ${totalMs} ms wall"
        )
        return RunResult(total = manifest.entries.size, failed = failed)
    }
}

internal fun loadFontsFromDirectory(dir: File): FontRegistry {
    require(dir.isDirectory) { "Fonts path is not a directory: ${dir.absolutePath}" }
    val registry = FontRegistry()
    val files = dir.listFiles { f -> f.isFile && (f.extension == "ttf" || f.extension == "otf") }
        ?: return registry
    for (f in files) {
        registry.registerFile(f.nameWithoutExtension, f)
    }
    return registry
}
