# rn-quick-render

Node CLI wrapper around `rn-quick-render`'s JVM renderer. Lets a
React Native developer paint a captured Fabric mount-instruction
stream to a PNG without installing the JDK + CMake + Gradle
build chain themselves.

> **Status:** pre-alpha. Single-platform per package (host you
> staged on); JDK 17+ must be installed separately. See
> [`docs/phase-5.md`](../docs/phase-5.md) for the productionisation
> roadmap (multi-platform `optionalDependencies` layout, daemon
> mode, Gradle plugin).

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

## Requirements

- **JDK 17+** on `$PATH` (or set `$JAVA_HOME`). The wrapper
  validates this at launch and prints a clear error if missing.
- **~250 MB** of disk for the staged runtime (fonts, ICU data,
  layoutlib framework resources, native libs).

## Why does this need a JVM?

The renderer wraps Android's `layoutlib` (JVM bytecode against
Android's native runtime libs). Wasm / Kotlin Native / GraalVM
Native Image can't host it. See [`docs/phase-5.md`](../docs/phase-5.md#compilation-form-options-and-why-theyre-blocked)
for the reasoning.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "package is missing its staged runtime" | Run `./gradlew :renderer:packageForNpm`. |
| "requires Java 17+" | Install / set `$JAVA_HOME` to JDK 17+. |
| "staged for X but the current host is Y" | Single-platform per package — re-stage with the right `-Ptarget=` (host is implicit; linux requires Docker). Multi-platform layout is on the Phase 5 roadmap. |
