# Linux Yoga build environment.
#
# Used by `:renderer:cmakeBuildLinux` to cross-build libyoga.so for
# linux-x64 when the build host is something other than linux-x64
# (e.g. mac-arm). Avoids forcing developers to commit a pre-built
# `.so` binary or maintain a separate CI matrix for the Linux Yoga
# build.
#
# Bake in cmake + g++ once; mount the yoga source + an empty output
# dir at run time:
#
#   docker build -t rn-quick-render/yoga-linux -f docker/yoga-linux.Dockerfile .
#   docker run --rm \
#     -v "${PWD}/yoga:/src:ro" \
#     -v "${PWD}/renderer/build/yoga-native-linux:/out" \
#     rn-quick-render/yoga-linux \
#     bash -c "cmake -S /cmake -B /out -DCMAKE_BUILD_TYPE=Release && cmake --build /out -j"
#
# Sized intentionally minimal — base ubuntu:22.04 (~80 MB) + the
# build tools (~250 MB). Build artefact (`libyoga.so`) is ~150 KB.

# Pinned to linux/amd64 since the layoutlib-runtime artefact only
# ships an x86_64 `libandroid_runtime.so` for linux. On a mac-arm
# host this runs under QEMU/Rosetta — slower but the build artefact
# (libyoga.so, ~150 KB) is what matters, not build wall-time.
FROM --platform=linux/amd64 ubuntu:22.04

# JDK provides JNI headers (`<jni.h>`) that Yoga's `find_package(JNI)`
# looks for; without it CMake fails at configure time. We use the
# full `openjdk-17-jdk` (not `-headless`) because CMake's `FindJNI`
# module also insists on `JAVA_AWT_LIBRARY` / `JAVA_AWT_INCLUDE_PATH`,
# which the headless variant strips. Yoga itself doesn't link AWT —
# the find_package check is overzealous — but bypassing it would
# require patching the Yoga CMakeLists, which would drift from
# upstream. Costs ~80 MB image bloat for a one-line dependency swap.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        cmake \
        g++ \
        make \
        openjdk-17-jdk && \
    rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

WORKDIR /work
