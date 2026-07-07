# rn-quick-render

Node CLI wrapper around `rn-quick-render`'s JVM renderer. Lets a
React Native developer paint a captured Fabric mount-instruction
stream to a PNG without installing the JDK + CMake + Gradle
build chain themselves.

> **Status:** pre-alpha. Single-platform per package (host you
> staged on); JDK 17+ must be installed separately. See
> [`docs/roadmap.md`](../docs/roadmap.md) for the distribution
> plan (multi-platform `optionalDependencies` layout, npm publish,
> size trimming).

## Install (from this checkout)

```bash
# Stage the runtime bundle for the build host → npm-cli/dist-<host>/
./gradlew :renderer:packageForNpm

# Cross-stage for linux-x64 (uses Docker for the Yoga build)
# → npm-cli/dist-linux/
./gradlew :renderer:packageForNpm -Ptarget=linux

# Smoke-test the wrapper without installing globally.
npm-cli/bin/rn-quick-render.js --help

# Or link it onto $PATH.
cd npm-cli && npm link
```

The wrapper auto-detects the runtime host and uses
`dist-<host>/`; the plain `dist/` directory is reserved for
the published npm-package layout.

## Usage

Same interface as the JVM CLI ([`renderer/.../Main.kt`](../renderer/src/main/kotlin/com/example/renderer/Main.kt)).

One-shot — pipe a single captured fixture in on stdin:

```bash
cat rn-harness/out/blueskyOnboardingInterests.json |
  rn-quick-render --output /tmp/oi.png
```

Optional flags: `--width W` `--height H` `--density D`
`--fontScale N` `--fonts DIR`.

Batch — fan many renders out across one warm JVM:

```bash
rn-quick-render --batch path/to/manifest.json
```

Manifest format:

```json
{
  "fonts": "path/to/fonts",
  "entries": [
    {
      "input": "out/foo.json",
      "output": "renders/foo_pixel5.png",
      "device": "pixel5",
      "fontScale": "default"
    },
    {
      "input": "out/foo__dark.json",
      "output": "renders/foo_tablet_dark.png",
      "device": "tablet"
    }
  ]
}
```

Named device profiles: `smallPhone` / `pixel5` / `pixel7Pro` /
`tablet`. Named font scales: `compact` / `default` / `large` /
`a11y` / `a11yMax`.

### verify — render + diff Jest-captured snapshots

Consumes the artifacts a Jest run emitted via
[`rn-quick-render-jest`](../npm-jest/README.md): merges the per-worker
manifests, renders the requested device × font-scale matrix in one warm
JVM (`--batch` under the hood), and pixel-diffs each PNG against
committed goldens.

```bash
# verify everything captured by the last test run
rn-quick-render verify __screensnaps__ --goldens snaps-goldens

# render only a subset (e.g. CI scoping to changed components)
rn-quick-render verify __screensnaps__ --goldens snaps-goldens --filter inbox
rn-quick-render verify __screensnaps__ --goldens snaps-goldens --test-path InboxCard

# bless the current renders as goldens
rn-quick-render verify __screensnaps__ --goldens snaps-goldens --record
```

Goldens default to a `<snapsDir>-goldens` sibling (commit that
directory; the snaps dir itself is test output). Fresh renders land in
`<snapsDir>/.renders/` for inspection on failure. Exit codes: 0 pass /
recorded, 1 diff or render failure, 2 usage error.

## Requirements

- **JDK 17+** on `$PATH` (or set `$JAVA_HOME`). The wrapper
  validates this at launch and prints a clear error if missing.
- **~250 MB** of disk for the staged runtime (fonts, ICU data,
  layoutlib framework resources, native libs).

## Why does this need a JVM?

The renderer wraps Android's `layoutlib` (JVM bytecode against
Android's native runtime libs). Wasm / Kotlin Native / GraalVM
Native Image can't host it. See the "Why a JVM at all" section of
[`docs/architecture.md`](../docs/architecture.md) for the reasoning.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "package is missing its staged runtime" | Run `./gradlew :renderer:packageForNpm`. |
| "requires Java 17+" | Install / set `$JAVA_HOME` to JDK 17+. |
| "staged for X but the current host is Y" | Single-platform per package — re-stage with the right `-Ptarget=` (host is implicit; linux requires Docker). Multi-platform layout is on the Phase 5 roadmap. |
