plugins {
    alias(libs.plugins.kotlin.jvm)
    application
}

application {
    mainClass.set("com.example.renderer.MainKt")
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    jvmToolchain(17)
}

// ---------------------------------------------------------------------------
// Yoga native build via CMake
// ---------------------------------------------------------------------------
val yogaDir = rootProject.file("yoga")
val yogaBuildDir = layout.buildDirectory.dir("yoga-native").get().asFile
val hostOs: String = System.getProperty("os.name").lowercase()
val libName: String = when {
    hostOs.contains("mac") || hostOs.contains("darwin") -> "libyoga.dylib"
    hostOs.contains("win") -> "yoga.dll"
    else -> "libyoga.so"
}

val cmakeConfigure by tasks.registering(Exec::class) {
    description = "Configure Yoga JNI build via CMake"
    workingDir = yogaBuildDir
    doFirst { yogaBuildDir.mkdirs() }

    commandLine(
        "cmake",
        "-DCMAKE_BUILD_TYPE=Release",
        file("cmake").absolutePath,
    )

    outputs.file(yogaBuildDir.resolve("CMakeCache.txt"))
    inputs.files(
        file("cmake/CMakeLists.txt"),
        yogaDir.resolve("yoga/CMakeLists.txt"),
        yogaDir.resolve("cmake/project-defaults.cmake"),
    )
}

val cmakeBuild by tasks.registering(Exec::class) {
    description = "Build libyoga JNI shared library"
    dependsOn(cmakeConfigure)
    workingDir = yogaBuildDir
    commandLine("cmake", "--build", ".", "--config", "Release", "-j")
    outputs.file(yogaBuildDir.resolve(libName))
}

// ---------------------------------------------------------------------------
// Linux Yoga cross-build via Docker
// ---------------------------------------------------------------------------
// Used by `packageForNpm -Ptarget=linux` when the build host is something
// other than linux-x64 (typically mac-arm). Stays out of the default
// build graph — only fires when packaging for the linux target.
val yogaBuildDirLinux = layout.buildDirectory.dir("yoga-native-linux").get().asFile
val dockerImageTag = "rn-quick-render/yoga-linux:cmake-ubuntu22"

val dockerBuildYogaImage by tasks.registering(Exec::class) {
    description = "Build the ubuntu+cmake+g++ image used for linux Yoga cross-builds"
    workingDir = projectDir
    // `--platform linux/amd64` is forced inside the Dockerfile too,
    // but passing it on the CLI suppresses Docker's "image platform
    // does not match host" warning during cross-builds on mac-arm.
    commandLine(
        "docker", "build",
        "--platform", "linux/amd64",
        "-t", dockerImageTag,
        "-f", "docker/yoga-linux.Dockerfile",
        ".",
    )
    // Treat the image as "fresh enough" once tagged; subsequent runs
    // are no-ops thanks to docker's layer cache.
    outputs.upToDateWhen {
        ProcessBuilder("docker", "image", "inspect", dockerImageTag)
            .redirectErrorStream(true)
            .start()
            .waitFor() == 0
    }
}

val cmakeBuildLinux by tasks.registering(Exec::class) {
    description = "Build libyoga.so for linux-x64 via Docker"
    dependsOn(dockerBuildYogaImage)
    doFirst { yogaBuildDirLinux.mkdirs() }
    workingDir = projectDir
    // Mount the repo root at `/work` (read-only) so the renderer/cmake
    // CMakeLists's relative `../../yoga` reference resolves naturally
    // inside the container. The build output dir is mounted separately
    // (read-write) so the produced .so lands back on the host.
    commandLine(
        "docker", "run", "--rm",
        "--platform", "linux/amd64",
        "-v", "${rootProject.projectDir.absolutePath}:/work:ro",
        "-v", "${yogaBuildDirLinux.absolutePath}:/out",
        dockerImageTag,
        "bash", "-c",
        "cmake -S /work/renderer/cmake -B /out -DCMAKE_BUILD_TYPE=Release && cmake --build /out -j",
    )
    outputs.file(yogaBuildDirLinux.resolve("libyoga.so"))
    inputs.files(
        file("cmake/CMakeLists.txt"),
        yogaDir.resolve("yoga/CMakeLists.txt"),
    )
}

// ---------------------------------------------------------------------------
// Yoga Java sources
// ---------------------------------------------------------------------------
val yogaJavaDir = layout.buildDirectory.dir("yoga-java-src").get().asFile
val copyYogaJava by tasks.registering(Copy::class) {
    from(yogaDir.resolve("java/com/facebook/yoga")) {
        exclude("YogaNative.java")
    }
    into(yogaJavaDir.resolve("com/facebook/yoga"))
    exclude("**/tests/**", "**/gen/**", "**/jni/**")
}

sourceSets {
    main {
        java.srcDir(yogaJavaDir)
    }
}

tasks.compileJava {
    dependsOn(cmakeBuild, copyYogaJava)
}
tasks.compileKotlin {
    dependsOn(cmakeBuild, copyYogaJava)
}

// ---------------------------------------------------------------------------
// layoutlib runtime extraction
// ---------------------------------------------------------------------------
// Platform-specific variant selection for layoutlib-runtime.
// The module publishes per-OS variants (linux, macX86, macArm, windows)
// with attributes org.gradle.native.operatingSystem / architecture.
val nativeOsAttr = Attribute.of("org.gradle.native.operatingSystem", String::class.java)
val nativeArchAttr = Attribute.of("org.gradle.native.architecture", String::class.java)

val layoutlibRuntime: Configuration by configurations.creating {
    isCanBeConsumed = false
    isCanBeResolved = true
    attributes {
        val os = System.getProperty("os.name").lowercase()
        val arch = System.getProperty("os.arch")
        when {
            os.contains("mac") || os.contains("darwin") -> {
                attribute(nativeOsAttr, "macos")
                attribute(nativeArchAttr, if (arch.contains("aarch64") || arch.contains("arm")) "aarch64" else "x86-64")
            }
            os.contains("win") -> {
                attribute(nativeOsAttr, "windows")
                attribute(nativeArchAttr, "x86-64")
            }
            else -> {
                attribute(nativeOsAttr, "linux")
                attribute(nativeArchAttr, "x86-64")
            }
        }
        // Required to match the variant's usage attribute
        attribute(Usage.USAGE_ATTRIBUTE, objects.named(Usage::class, Usage.JAVA_RUNTIME))
    }
}
// Linux-targeted layoutlib runtime variant — pulled via the same
// Gradle attribute matching, just with linux/x86-64 hard-coded so
// the configuration resolves to the linux classifier of the
// per-platform `layoutlib-runtime` artefact regardless of build
// host. Only used when packageForNpm runs with `-Ptarget=linux`.
val layoutlibRuntimeLinux: Configuration by configurations.creating {
    isCanBeConsumed = false
    isCanBeResolved = true
    attributes {
        attribute(nativeOsAttr, "linux")
        attribute(nativeArchAttr, "x86-64")
        attribute(Usage.USAGE_ATTRIBUTE, objects.named(Usage::class, Usage.JAVA_RUNTIME))
    }
}
val layoutlibResources: Configuration by configurations.creating

val layoutlibDataDir = layout.buildDirectory.dir("layoutlib-data").get().asFile
val layoutlibDataDirLinux = layout.buildDirectory.dir("layoutlib-data-linux").get().asFile

val extractLayoutlib by tasks.registering {
    description = "Extract fonts, native libs, and ICU from layoutlib-runtime JAR"
    dependsOn(layoutlibRuntime, layoutlibResources)

    val dataDir = layoutlibDataDir
    outputs.dir(dataDir)

    doLast {
        val runtimeJar = layoutlibRuntime.resolve().first()
        val resourcesJar = layoutlibResources.resolve().first()

        // Extract runtime data (fonts, native libs, ICU, keyboards, etc.)
        project.copy {
            from(project.zipTree(runtimeJar))
            include("data/**")
            into(dataDir)
        }

        // Extract framework resources
        project.copy {
            from(project.zipTree(resourcesJar))
            into(dataDir.resolve("layoutlib-resources"))
        }
    }
}

// Linux-targeted twin of `extractLayoutlib`, populated from the
// linux variant of the layoutlib-runtime artefact regardless of
// build host. Lives in a sibling output dir so cross-target builds
// don't stomp on the host build.
val extractLayoutlibLinux by tasks.registering {
    description = "Extract layoutlib runtime data + resources for the linux target"
    dependsOn(layoutlibRuntimeLinux, layoutlibResources)
    outputs.dir(layoutlibDataDirLinux)
    doLast {
        val runtimeJar = layoutlibRuntimeLinux.resolve().first()
        val resourcesJar = layoutlibResources.resolve().first()
        project.copy {
            from(project.zipTree(runtimeJar))
            include("data/**")
            into(layoutlibDataDirLinux)
        }
        project.copy {
            from(project.zipTree(resourcesJar))
            into(layoutlibDataDirLinux.resolve("layoutlib-resources"))
        }
    }
}

// Determine native library subdirectory for this platform
val nativeLibSubdir: String = when {
    hostOs.contains("mac") || hostOs.contains("darwin") -> {
        val arch = System.getProperty("os.arch")
        if (arch.contains("aarch64") || arch.contains("arm")) "mac-arm" else "mac"
    }
    hostOs.contains("win") -> "win"
    else -> "linux"
}

tasks.test {
    dependsOn(extractLayoutlib)
    useJUnit()

    // Yoga native lib + layoutlib native libs on java.library.path
    val layoutlibNativeDir = layoutlibDataDir.resolve("data/$nativeLibSubdir/lib64")
    systemProperty("java.library.path",
        listOf(yogaBuildDir, layoutlibNativeDir).joinToString(File.pathSeparator))

    // Paths for Bridge.init()
    systemProperty("layoutlib.data", layoutlibDataDir.resolve("data").absolutePath)
    systemProperty("layoutlib.resources", layoutlibDataDir.resolve("layoutlib-resources").absolutePath)

    // Forward the record toggle from gradle CLI (-Drenderer.record=true) to
    // the test JVM so SnapshotRendererTest can re-record committed goldens.
    System.getProperty("renderer.record")?.let { systemProperty("renderer.record", it) }
}

// Same native-lib + layoutlib-data plumbing as `tasks.test`, but for
// `gradle :renderer:run` — without these the CLI fails on `Bridge.init()`
// with "System property 'layoutlib.data' not set". Tests historically
// went first so this gap was invisible; surfaced when wiring up
// `--batch` for one-shot / matrix CLI runs outside the test harness.
tasks.named<JavaExec>("run") {
    dependsOn(extractLayoutlib)
    val layoutlibNativeDir = layoutlibDataDir.resolve("data/$nativeLibSubdir/lib64")
    systemProperty("java.library.path",
        listOf(yogaBuildDir, layoutlibNativeDir).joinToString(File.pathSeparator))
    systemProperty("layoutlib.data", layoutlibDataDir.resolve("data").absolutePath)
    systemProperty("layoutlib.resources", layoutlibDataDir.resolve("layoutlib-resources").absolutePath)
}

// ---------------------------------------------------------------------------
// npm-cli packaging (Phase 5 step 3)
// ---------------------------------------------------------------------------
// Populates `npm-cli/dist-<target>/` with everything the Node CLI wrapper
// needs to spawn a working JVM:
//   - lib/*.jar             — classpath dump (renderer + all deps)
//   - layoutlib-data/        — fonts, icu, keyboards, $platform/lib64/
//   - layoutlib-resources/   — framework XML resources
//   - native/                — built libyoga.{dylib|so|dll}
//   - build-info.json        — metadata the wrapper reads at launch
//
// Target selection via `-Ptarget=<host|linux>`:
//   - `host` (default): packages for the build host; uses cmakeBuild +
//     the host's layoutlib-runtime variant.
//   - `linux`: packages for linux-x64; uses cmakeBuildLinux (Docker) +
//     the linux layoutlib-runtime variant. Works from any build host.
//
// Output dir is per-target so successive builds for different targets
// don't stomp on each other. The npm wrapper expects `dist/` (no
// suffix) — for publishing, copy or symlink the desired `dist-<target>/`
// to `dist/`. Multi-platform via optionalDependencies sub-packages is
// step 3b.
val target: String = (project.findProperty("target") as String?) ?: "host"

data class PackageTargetSpec(
    val name: String,            // canonical name → npm-cli/dist-<name>/
    val platformLabel: String,   // dir name inside layoutlib-data/data/
    val yogaLibName: String,     // libyoga.{so|dylib|dll}
    val yogaBuildDir: File,
    val layoutlibDataDir: File,
    val yogaBuildTask: TaskProvider<*>,
    val extractLayoutlibTask: TaskProvider<*>,
)

val targetSpec: PackageTargetSpec = when (target) {
    "host" -> PackageTargetSpec(
        name = nativeLibSubdir,
        platformLabel = nativeLibSubdir,
        yogaLibName = libName,
        yogaBuildDir = yogaBuildDir,
        layoutlibDataDir = layoutlibDataDir,
        yogaBuildTask = cmakeBuild,
        extractLayoutlibTask = extractLayoutlib,
    )
    "linux" -> PackageTargetSpec(
        name = "linux",
        platformLabel = "linux",
        yogaLibName = "libyoga.so",
        yogaBuildDir = yogaBuildDirLinux,
        layoutlibDataDir = layoutlibDataDirLinux,
        yogaBuildTask = cmakeBuildLinux,
        extractLayoutlibTask = extractLayoutlibLinux,
    )
    else -> error("Unknown packageForNpm target: \"$target\". Supported: host | linux")
}

val npmCliDir = rootProject.file("npm-cli/dist-${targetSpec.name}")

val packageForNpm by tasks.registering(Copy::class) {
    description = "Stage the renderer jars + native libs + layoutlib data for the npm CLI wrapper"
    group = "distribution"
    dependsOn(tasks.named("installDist"), targetSpec.extractLayoutlibTask, targetSpec.yogaBuildTask)

    val installRoot = layout.buildDirectory.dir("install/renderer").get().asFile

    into(npmCliDir)

    // 1. All classpath jars from installDist into dist/lib/
    from(installRoot.resolve("lib")) {
        into("lib")
    }

    // 2. layoutlib data (fonts/icu/keyboards + this-target's native libs)
    from(targetSpec.layoutlibDataDir.resolve("data")) {
        into("layoutlib-data/data")
    }

    // 3. layoutlib framework resources
    from(targetSpec.layoutlibDataDir.resolve("layoutlib-resources")) {
        into("layoutlib-resources")
    }

    // 4. Yoga native lib for this target
    from(targetSpec.yogaBuildDir.resolve(targetSpec.yogaLibName)) {
        into("native")
    }

    doFirst {
        npmCliDir.deleteRecursively()
    }

    doLast {
        npmCliDir.resolve("build-info.json").writeText(
            buildString {
                append("{\n")
                append("  \"platform\": \"${targetSpec.platformLabel}\",\n")
                append("  \"yogaLib\": \"${targetSpec.yogaLibName}\",\n")
                append("  \"buildTimeMs\": ${System.currentTimeMillis()}\n")
                append("}\n")
            }
        )
        println("[packageForNpm] target=${targetSpec.name} staged → ${npmCliDir.absolutePath}")
    }
}

dependencies {
    implementation(libs.gson)
    implementation(libs.layoutlib.api)
    implementation(libs.layoutlib.runtime)
    implementation(libs.kxml2)
    implementation("com.google.code.findbugs:jsr305:3.0.2")
    // Force JAR download despite POM declaring <packaging>pom</packaging>
    implementation(libs.layoutlib.bridge) {
        artifact { type = "jar" }
    }
    testImplementation(libs.junit)

    layoutlibRuntime(libs.layoutlib.runtime)
    // Linux-targeted layoutlib runtime — same module, different
    // attribute set on the configuration pulls the linux variant
    // of the per-OS artefact. Used by `packageForNpm -Ptarget=linux`.
    layoutlibRuntimeLinux(libs.layoutlib.runtime)
    layoutlibResources(libs.layoutlib.resources)
}
