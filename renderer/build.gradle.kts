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
val layoutlibResources: Configuration by configurations.creating

val layoutlibDataDir = layout.buildDirectory.dir("layoutlib-data").get().asFile

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
    layoutlibResources(libs.layoutlib.resources)
}
