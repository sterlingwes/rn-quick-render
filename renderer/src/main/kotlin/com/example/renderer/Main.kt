package com.example.renderer

import java.io.File
import javax.imageio.ImageIO
import kotlin.system.exitProcess

/**
 * CLI entry point for the snapshot renderer.
 *
 * Two modes:
 *
 *   1. **One-shot** (default): reads Fabric mount-instruction
 *      JSON from stdin, renders one PNG to `--output`. Pays the
 *      ~4 s `Bridge.init()` cost per invocation; best for an
 *      ad-hoc single render.
 *
 *      ```
 *      cat fixture.json | java -jar renderer.jar [--width W] [--height H]
 *                            [--density D] [--output FILE] [--fonts DIR]
 *                            [--fontScale N]
 *      ```
 *
 *   2. **Batch** (`--batch <manifest.json>`): reads a manifest of
 *      N entries and renders all of them inside one JVM,
 *      amortising init across the run. Bootstraps are cached per
 *      device profile so a matrix run pays init at most once per
 *      device class. See [BatchManifest] for the format.
 *
 *      ```
 *      java -jar renderer.jar --batch manifest.json
 *      ```
 *
 * `--fonts` points at a directory of `.ttf` / `.otf` files; each
 * is registered under its filename (without extension) so a
 * `style.fontFamily` of `"Inter"` resolves to `Inter.ttf`. In
 * batch mode, `fonts` may be set in the manifest at top level
 * (default for every entry) or per-entry (override).
 */
fun main(args: Array<String>) {
    var width = 1080
    var height = 2340
    var density = 440
    var output = "output.png"
    var fontsDir: String? = null
    var fontScale = 1.0f
    var batchManifest: String? = null

    val iter = args.iterator()
    while (iter.hasNext()) {
        when (val arg = iter.next()) {
            "--width" -> width = iter.next().toInt()
            "--height" -> height = iter.next().toInt()
            "--density" -> density = iter.next().toInt()
            "--output" -> output = iter.next()
            "--fonts" -> fontsDir = iter.next()
            "--fontScale" -> fontScale = iter.next().toFloat()
            "--batch" -> batchManifest = iter.next()
            else -> {
                System.err.println("Unknown argument: $arg")
                System.err.println(
                    "Usage:\n" +
                        "  one-shot: renderer [--width W] [--height H] [--density D] " +
                            "[--output FILE] [--fonts DIR] [--fontScale N]\n" +
                        "  batch:    renderer --batch MANIFEST.json"
                )
                exitProcess(1)
            }
        }
    }

    if (batchManifest != null) {
        val manifest = BatchManifestParser.parse(File(batchManifest))
        val result = BatchRunner.run(manifest)
        exitProcess(if (result.failed == 0) 0 else 1)
    }

    val json = System.`in`.bufferedReader().readText()
    if (json.isBlank()) {
        System.err.println("Error: no JSON received on stdin")
        exitProcess(1)
    }

    val fontRegistry = fontsDir?.let { loadFontsFromDirectory(File(it)) } ?: FontRegistry.EMPTY

    val bootstrap = LayoutlibBootstrap.create(width, height, density)
    val renderer = SnapshotRenderer(
        bootstrap, width, height, density,
        fontRegistry = fontRegistry,
        fontScale = fontScale,
    )
    val image = renderer.render(json)

    val outputFile = File(output)
    ImageIO.write(image, "png", outputFile)
    println("Rendered ${image.width}×${image.height} → ${outputFile.absolutePath}")
}
