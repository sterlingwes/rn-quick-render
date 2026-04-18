#!/usr/bin/env bash
# Phase 0 local driver.
#
# Usage:
#   scripts/phase0.sh record   # generate golden PNGs for the four probe views
#   scripts/phase0.sh verify   # re-render and diff against existing goldens
#   scripts/phase0.sh perf     # run the perf harness and print build/phase0-metrics.json
#   scripts/phase0.sh all      # record + perf (first-run smoke test)
#
# Prerequisites: JDK 17+, network access to Maven Central, Google Maven
# (dl.google.com), and plugins.gradle.org.
set -euo pipefail

cmd=${1:-all}
cd "$(dirname "$0")/.."

case "$cmd" in
  record)
    ./gradlew :snapshots:recordPaparazziDebug --no-daemon --stacktrace
    ;;
  verify)
    ./gradlew :snapshots:verifyPaparazziDebug --no-daemon --stacktrace
    ;;
  perf)
    ./gradlew :snapshots:testDebugUnitTest \
      --tests "com.example.snapshot.Phase0PerfHarness" \
      --no-daemon --stacktrace
    cat snapshots/build/phase0-metrics.json
    ;;
  all)
    ./gradlew :snapshots:recordPaparazziDebug --no-daemon --stacktrace
    ./gradlew :snapshots:testDebugUnitTest \
      --tests "com.example.snapshot.Phase0PerfHarness" \
      --no-daemon --stacktrace
    cat snapshots/build/phase0-metrics.json
    ;;
  *)
    echo "unknown command: $cmd" >&2
    exit 2
    ;;
esac
