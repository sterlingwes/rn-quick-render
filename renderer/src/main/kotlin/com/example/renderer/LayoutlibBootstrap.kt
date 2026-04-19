package com.example.renderer

import com.android.ide.common.rendering.api.*
import com.android.resources.*
import java.io.File

/**
 * Bootstraps Android's layoutlib rendering engine without Paparazzi.
 *
 * Initialises the Bridge with fonts, native libs, and ICU data from the
 * extracted `layoutlib-runtime` JAR, then creates a RenderSession that
 * can render programmatic View trees to `BufferedImage`.
 */
class LayoutlibBootstrap private constructor(
    private val bridge: Bridge,
    val renderSession: RenderSession,
) {
    companion object {
        /**
         * Initialise layoutlib from system properties set by the Gradle build:
         * - `layoutlib.data`      — extracted `data/` from layoutlib-runtime
         * - `layoutlib.resources` — extracted layoutlib-resources
         */
        fun create(
            screenWidth: Int = 1080,
            screenHeight: Int = 2340,
            densityDpi: Int = 440,
        ): LayoutlibBootstrap {
            val dataDir = File(System.getProperty("layoutlib.data")
                ?: error("System property 'layoutlib.data' not set"))
            val resourcesDir = File(System.getProperty("layoutlib.resources")
                ?: error("System property 'layoutlib.resources' not set"))

            val fontsDir = dataDir.resolve("fonts")
            val icuData = findIcuData(dataDir)
            val nativeLibDir = findNativeLibDir(dataDir)
            val keyboardDir = dataDir.resolve("keyboards/Generic.kcm")

            // Load build.prop for system properties
            val buildProp = dataDir.resolve("build.prop")
            val systemProps = mutableMapOf<String, String>()
            if (buildProp.exists()) {
                buildProp.readLines().forEach { line ->
                    val trimmed = line.trim()
                    if (trimmed.isNotEmpty() && !trimmed.startsWith("#") && trimmed.contains("=")) {
                        val (k, v) = trimmed.split("=", limit = 2)
                        systemProps[k.trim()] = v.trim()
                    }
                }
            }
            systemProps["debug.choreographer.frametime"] = "false"

            // Properties required by android.os.Build static initializer
            systemProps.putIfAbsent("ro.product.cpu.abilist", "arm64-v8a,armeabi-v7a,armeabi")
            systemProps.putIfAbsent("ro.product.cpu.abilist32", "armeabi-v7a,armeabi")
            systemProps.putIfAbsent("ro.product.cpu.abilist64", "arm64-v8a")
            systemProps.putIfAbsent("ro.build.display.id", "layoutlib")
            systemProps.putIfAbsent("ro.build.version.sdk", "34")
            systemProps.putIfAbsent("ro.build.version.codename", "REL")
            systemProps.putIfAbsent("ro.build.version.release", "14")
            systemProps.putIfAbsent("ro.build.type", "eng")
            systemProps.putIfAbsent("ro.debuggable", "1")
            systemProps.putIfAbsent("ro.build.version.all_codenames", "REL")
            systemProps.putIfAbsent("ro.build.version.known_codenames", "REL")
            systemProps.putIfAbsent("ro.build.version.release_or_codename", "14")
            systemProps.putIfAbsent("ro.build.version.release_or_preview_display", "14")
            systemProps.putIfAbsent("ro.build.version.security_patch", "2024-01-01")
            systemProps.putIfAbsent("ro.build.version.incremental", "0")

            // Load the concrete Bridge implementation from layoutlib-runtime.
            // The API class is abstract; the impl is com.android.layoutlib.bridge.Bridge.
            val bridgeClass = Class.forName("com.android.layoutlib.bridge.Bridge")
            val bridge = bridgeClass.getDeclaredConstructor().newInstance() as Bridge

            // Bridge.init(platformProps, fontLocation, nativeLibDirPath, icuDataPath,
            //             keyboardPaths, enumValueMap, log)
            val initResult = bridge.init(
                systemProps,
                fontsDir,
                nativeLibDir.absolutePath,
                icuData.absolutePath,
                if (keyboardDir.exists()) arrayOf(keyboardDir.absolutePath) else emptyArray(),
                emptyMap(), // enumValueMap — not needed for programmatic view construction
                StderrLayoutLog,
            )
            check(initResult) { "Bridge.init() failed" }

            // Build HardwareConfig
            val density = Density.create(densityDpi)
            val hardwareConfig = HardwareConfig(
                screenWidth,
                screenHeight,
                density,
                densityDpi.toFloat(),
                densityDpi.toFloat(),
                ScreenSize.NORMAL,
                ScreenOrientation.PORTRAIT,
                ScreenRound.NOTROUND,
                true, // softButtons
            )

            // Load framework resources from layoutlib-resources
            val frameworkResources = FrameworkResourceLoader.load(
                resourcesDir.resolve("res")
            )

            // Build SessionParams with framework-backed resource resolver
            val sessionParams = SessionParams(
                EmptyLayoutParser(),
                SessionParams.RenderingMode.NORMAL,
                /* projectKey */ Any(),
                hardwareConfig,
                ResourceResolverStub(frameworkResources),
                StubLayoutlibCallback(),
                0, // minSdk
                34, // targetSdk
                StderrLayoutLog,
            )
            sessionParams.setForceNoDecor()

            // Create and initialise render session
            val renderSession = bridge.createSession(sessionParams)
            check(renderSession.result.isSuccess) {
                val ex = renderSession.result.exception
                val msg = "createSession failed: ${renderSession.result.status} ${renderSession.result.errorMessage ?: ""}"
                if (ex != null) "$msg\nCaused by: $ex" else msg
            }

            return LayoutlibBootstrap(bridge, renderSession)
        }

        private fun findIcuData(dataDir: File): File {
            val icuDir = dataDir.resolve("icu")
            if (icuDir.isDirectory) {
                val dat = icuDir.listFiles()?.firstOrNull { it.name.endsWith(".dat") }
                if (dat != null) return dat
            }
            error("ICU data file not found in ${icuDir.absolutePath}")
        }

        private fun findNativeLibDir(dataDir: File): File {
            val os = System.getProperty("os.name").lowercase()
            val arch = System.getProperty("os.arch")
            val subdir = when {
                os.contains("mac") || os.contains("darwin") ->
                    if (arch.contains("aarch64") || arch.contains("arm")) "mac-arm" else "mac"
                os.contains("win") -> "win"
                else -> "linux"
            }
            val libDir = dataDir.resolve("$subdir/lib64")
            if (libDir.isDirectory) return libDir
            val fallback = dataDir.resolve("lib64")
            if (fallback.isDirectory) return fallback
            error("Native lib directory not found for $subdir in ${dataDir.absolutePath}")
        }
    }
}
