package com.example.renderer

import java.io.File
import javax.imageio.ImageIO

/**
 * CLI entry point for the snapshot renderer.
 *
 * Reads Fabric mount-instruction JSON from stdin, renders to PNG.
 *
 * Usage:
 *   java -jar renderer.jar [--width 1080] [--height 2340] [--density 440]
 *                          [--output output.png] [--fonts /path/to/fonts]
 *
 * `--fonts` points at a directory of `.ttf` / `.otf` files; each is
 * registered under its filename (without extension) so a `style.fontFamily`
 * of `"Inter"` resolves to `Inter.ttf` from that directory.
 */
fun main(args: Array<String>) {
    var width = 1080
    var height = 2340
    var density = 440
    var output = "output.png"
    var fontsDir: String? = null
    var fontScale = 1.0f

    val iter = args.iterator()
    while (iter.hasNext()) {
        when (val arg = iter.next()) {
            "--width" -> width = iter.next().toInt()
            "--height" -> height = iter.next().toInt()
            "--density" -> density = iter.next().toInt()
            "--output" -> output = iter.next()
            "--fonts" -> fontsDir = iter.next()
            "--fontScale" -> fontScale = iter.next().toFloat()
            else -> {
                System.err.println("Unknown argument: $arg")
                System.err.println(
                    "Usage: renderer [--width W] [--height H] [--density D] " +
                        "[--output FILE] [--fonts DIR] [--fontScale N]"
                )
                System.exit(1)
            }
        }
    }

    val json = System.`in`.bufferedReader().readText()
    if (json.isBlank()) {
        System.err.println("Error: no JSON received on stdin")
        System.exit(1)
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

private fun loadFontsFromDirectory(dir: File): FontRegistry {
    require(dir.isDirectory) { "Fonts path is not a directory: ${dir.absolutePath}" }
    val registry = FontRegistry()
    val files = dir.listFiles { f -> f.isFile && (f.extension == "ttf" || f.extension == "otf") }
        ?: return registry
    for (f in files) {
        registry.registerFile(f.nameWithoutExtension, f)
    }
    return registry
}
