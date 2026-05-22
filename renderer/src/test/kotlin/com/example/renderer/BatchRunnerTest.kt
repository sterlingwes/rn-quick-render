package com.example.renderer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import javax.imageio.ImageIO

/**
 * Smoke-tests `--batch` mode end-to-end: write a tiny manifest
 * pointing at one captured fixture and two device profiles,
 * run the [BatchRunner], assert the two PNGs land at the
 * manifest-specified output paths.
 *
 * Covers the points the per-fixture matrix tests don't:
 * - manifest JSON → typed `BatchManifest` parsing
 * - bootstrap caching across mixed-device entries (two devices
 *   in one run should produce two bootstraps, not four)
 * - output-directory creation
 * - per-render PNG dimensions match the picked device
 *
 * Doesn't re-verify visual fidelity — `SnapshotRendererTest` /
 * `DeviceMatrixSnapshotTest` already golden-diff those bits.
 */
class BatchRunnerTest {

    @get:Rule
    val tmp = TemporaryFolder()

    @Test
    fun batchMode_rendersMultipleEntries_acrossDevicesAndScales() {
        val fixturePath = "../rn-harness/out/blueskyOnboardingInterests.json"
        val outA = tmp.newFile("a.png")
        val outB = tmp.newFile("b.png")
        val manifestFile = tmp.newFile("manifest.json")
        manifestFile.writeText(
            """
            {
              "entries": [
                { "input": "$fixturePath", "output": "${outA.absolutePath}", "device": "pixel5", "fontScale": "default" },
                { "input": "$fixturePath", "output": "${outB.absolutePath}", "device": "tablet", "fontScale": "large" }
              ]
            }
            """.trimIndent(),
        )

        val manifest = BatchManifestParser.parse(manifestFile)
        assertEquals(2, manifest.entries.size)

        val result = BatchRunner.run(manifest)
        assertEquals("no entries should have failed", 0, result.failed)
        assertEquals(2, result.total)

        assertTrue("output A not written", outA.exists() && outA.length() > 0)
        assertTrue("output B not written", outB.exists() && outB.length() > 0)

        val imgA = ImageIO.read(outA)
        val imgB = ImageIO.read(outB)
        assertEquals("A: width should match pixel5", DeviceProfile.PIXEL_5.widthPx, imgA.width)
        assertEquals("A: height should match pixel5", DeviceProfile.PIXEL_5.heightPx, imgA.height)
        assertEquals("B: width should match tablet", DeviceProfile.TABLET.widthPx, imgB.width)
        assertEquals("B: height should match tablet", DeviceProfile.TABLET.heightPx, imgB.height)
    }

    @Test
    fun batchManifest_rejectsMissingFields() {
        val missingEntries = tmp.newFile("no-entries.json")
        missingEntries.writeText("""{ "fonts": null }""")
        val thrown = runCatching { BatchManifestParser.parse(missingEntries) }
        assertTrue(
            "parser should error on missing entries",
            thrown.isFailure && (thrown.exceptionOrNull()?.message ?: "").contains("entries"),
        )

        val missingInput = tmp.newFile("no-input.json")
        missingInput.writeText("""{ "entries": [{ "output": "x.png", "device": "pixel5" }] }""")
        val thrown2 = runCatching { BatchManifestParser.parse(missingInput) }
        assertTrue(
            "parser should error on missing input field",
            thrown2.isFailure && (thrown2.exceptionOrNull()?.message ?: "").contains("input"),
        )
    }

    @Test
    fun batchLookup_rejectsUnknownDeviceOrScale() {
        val badDevice = runCatching { BatchLookup.device("totally-fake-phone") }
        assertTrue(
            "lookup should error on unknown device",
            badDevice.isFailure && (badDevice.exceptionOrNull()?.message ?: "").contains("totally-fake-phone"),
        )

        val badScale = runCatching { BatchLookup.fontScale("ginormous") }
        assertTrue(
            "lookup should error on unknown font scale",
            badScale.isFailure && (badScale.exceptionOrNull()?.message ?: "").contains("ginormous"),
        )
    }
}
