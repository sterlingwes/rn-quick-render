# Cross-platform Yoga JNI build for host JVM.
# Wraps the upstream yoga C++ core and JNI sources, replacing the
# GNU-ld-only --version-script with platform-appropriate symbol control.

cmake_minimum_required(VERSION 3.13...3.26)
project(yogajni)
set(CMAKE_VERBOSE_MAKEFILE on)

# Locate JNI headers (jni.h) from the host JDK
find_package(JNI REQUIRED)

set(YOGA_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../yoga")
include(${YOGA_ROOT}/cmake/project-defaults.cmake)

# Build the core C++ static library
add_subdirectory(${YOGA_ROOT}/yoga ${CMAKE_CURRENT_BINARY_DIR}/yogacore)

# Collect JNI C++ sources
file(GLOB JNI_SOURCES CONFIGURE_DEPENDS ${YOGA_ROOT}/java/jni/*.cpp)

add_library(yoga SHARED ${JNI_SOURCES})
target_link_libraries(yoga yogacore)
target_include_directories(yoga PRIVATE ${JNI_INCLUDE_DIRS})

# The JNI method registration tables use string literals as char* (JNI API
# predates const-correctness). Suppress the warning that -Werror promotes.
if(CMAKE_CXX_COMPILER_ID MATCHES "Clang|AppleClang")
    target_compile_options(yoga PRIVATE -Wno-writable-strings)
elseif(CMAKE_CXX_COMPILER_ID STREQUAL "GNU")
    target_compile_options(yoga PRIVATE -Wno-write-strings)
endif()

# Symbol visibility: only export JNI_OnLoad
if(APPLE)
    # macOS uses -exported_symbols_list
    set(EXPORT_FILE "${CMAKE_CURRENT_BINARY_DIR}/yogajni.exp")
    file(WRITE ${EXPORT_FILE} "_JNI_OnLoad\n")
    target_link_options(yoga PRIVATE "-Wl,-exported_symbols_list,${EXPORT_FILE}")
elseif(UNIX)
    # Linux uses --version-script
    set(VERSION_SCRIPT "${YOGA_ROOT}/java/yogajni.version")
    target_link_options(yoga PRIVATE "-Wl,--version-script=${VERSION_SCRIPT}")
endif()
