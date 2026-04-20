package com.example.renderer

import java.io.File
import javax.imageio.ImageIO

/**
 * CLI entry point for the snapshot renderer.
 *
 * Reads Fabric mount-instruction JSON from stdin, renders to PNG.
 *
 * Usage:
 *   java -jar renderer.jar [--width 1080] [--height 2340] [--density 440] [--output output.png]
 */
fun main(args: Array<String>) {
    var width = 1080
    var height = 2340
    var density = 440
    var output = "output.png"

    val iter = args.iterator()
    while (iter.hasNext()) {
        when (val arg = iter.next()) {
            "--width" -> width = iter.next().toInt()
            "--height" -> height = iter.next().toInt()
            "--density" -> density = iter.next().toInt()
            "--output" -> output = iter.next()
            else -> {
                System.err.println("Unknown argument: $arg")
                System.err.println("Usage: renderer [--width W] [--height H] [--density D] [--output FILE]")
                System.exit(1)
            }
        }
    }

    val json = System.`in`.bufferedReader().readText()
    if (json.isBlank()) {
        System.err.println("Error: no JSON received on stdin")
        System.exit(1)
    }

    val bootstrap = LayoutlibBootstrap.create(width, height, density)
    val renderer = SnapshotRenderer(bootstrap, width, height, density)
    val image = renderer.render(json)

    val outputFile = File(output)
    ImageIO.write(image, "png", outputFile)
    println("Rendered ${image.width}×${image.height} → ${outputFile.absolutePath}")
}
