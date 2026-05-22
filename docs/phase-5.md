# Phase 5 — packaging / distribution

The explore plan calls Phase 5 "Productionisation": Gradle
plugin, npm CLI, integration with snapshot-diff tooling, docs.
The piece that *also* moves the perf needle — amortising the
~4 s `Bridge.init()` cost across many renders — lives here too,
because it determines what binary form the tool ships in.

## Compilation-form options (and why they're blocked)

For context: layoutlib is **JVM bytecode** built against Android's
native runtime libraries (`libandroid_runtime`, ICU, BoringSSL).
That rules out the obvious "make the JVM go away" axes:

- **Kotlin/Wasm** — would lose layoutlib entirely. The whole
  value prop is using Android's view system; rebuilding it in
  Wasm is a multi-year rewrite.
- **Kotlin/Native** — same problem. layoutlib doesn't run
  without a JVM.
- **GraalVM Native Image** — layoutlib leans hard on runtime
  reflection that GraalVM's static analysis chokes on. Possibly
  tractable with extensive reflection registration; not worth
  the effort given JVM startup (~1 s) isn't the dominant cost.

The dominant cost is `Bridge.init()` at ~4 s per JVM, not JVM
startup. So packaging that *amortises* that init is where the
perf wins are.

## Step 1 — `--batch` mode (✅ landed)

One JVM lifecycle, N renders. Reads a manifest:

```json
{
  "fonts": "path/to/fonts",
  "entries": [
    {
      "input": "out/fixture.json",
      "output": "renders/foo.png",
      "device": "pixel5",
      "fontScale": "default"
    }
  ]
}
```

- `device` and `fontScale` are looked up by name in
  [`DeviceProfile.ALL`](../renderer/src/main/kotlin/com/example/renderer/DeviceProfile.kt) /
  [`FontScale.ALL`](../renderer/src/main/kotlin/com/example/renderer/FontScale.kt).
- `fontScale` defaults to `"default"` (1.0×) when omitted.
- `fonts` is optional and may be set at the manifest level
  (default for every entry) or per-entry (override).
- Output directories are created if missing.

Bootstraps are cached per [`DeviceProfile`] across entries — a
matrix of 4 devices × 10 fixtures = 40 entries pays
`Bridge.init()` 4 times, not 40.

```bash
./gradlew :renderer:run --args="--batch path/to/manifest.json"
```

### Observed amortisation

3-entry sanity-check manifest (2 device profiles): 1.7 s wall,
1.1 s init, 336 ms render. Equivalent 3 separate one-shot
invocations would have paid ~5 s of init each → ~15 s. ~9×
speedup with zero daemon machinery.

### Scope decisions

- **Default stays one-shot.** Adding `--batch` doesn't change
  the existing `cat foo.json | renderer` behaviour — that's
  still the fastest path for a single ad-hoc render and the
  simplest mental model for first-time users.
- **Named profiles only, for now.** `"device": "pixel5"` is
  ergonomic and keeps manifest entries comparable to matrix-test
  output filenames. Ad-hoc dimensions (`{"widthPx": 800, ...}`)
  can be added later if a real workload needs them.
- **Color scheme handled outside the manifest.** Theme is baked
  into the captured JSON at harness time (see Phase 4 step 3),
  so the manifest just references the right pre-captured input
  (`.../foo.json` for light, `.../foo__dark.json` for dark).
  Keeps the renderer entirely theme-agnostic, no
  manifest-side theme field needed.

## Step 2 — Gradle plugin (⏳)

The natural distribution target for Android dev workflows.
Gradle already runs as a daemon, so a `:renderer:snapshot` task
that batches over a configured matrix gets bootstrap amortisation
for free across builds in the same Gradle daemon session.

Open questions:

- Plugin module structure — likely a separate `renderer-plugin`
  module that depends on the existing `renderer` and exposes a
  DSL extension.
- DSL design — declarative matrix (devices, font scales, themes,
  fixtures), or programmatic (callback per entry)?
- Where do captured `.json` inputs come from? Probably a separate
  task that runs the JS harness against the consumer's
  fixtures, with the snapshot task depending on it.

## Step 3 — npm CLI wrapper (🟡 first slice landed)

Lives in [`npm-cli/`](../npm-cli/). A thin Node CLI that:

- Locates the staged jars + native libs + layoutlib data under
  `dist/` (populated by `./gradlew :renderer:packageForNpm`)
- Validates a JDK 17+ runtime is available (prefers `$JAVA_HOME`,
  falls back to PATH), errors clearly if missing or too old
- Composes the right `java.library.path` for the current
  platform's native lib subdir
- Forwards every CLI arg verbatim to the existing `Main.kt`
  entry point (so `--batch`, `--fontScale`, etc. just work
  through the wrapper)

### Decisions

- **System Java 17+, not bundled JDK.** A bundled JDK via `jlink`
  would add ~30–50 MB on top of the already-large layoutlib
  bundle; most RN devs targeting Android already have a JDK. The
  CLI fails fast with a clear actionable error when missing
  rather than silently degrading.
- **Single-platform package for now.** `packageForNpm` stages
  whichever native libs the build host has (currently `mac-arm`).
  The wrapper detects the running host and errors clearly if
  staged-platform ≠ host-platform. Multi-platform via npm's
  `optionalDependencies` pattern (`@rn-quick-render/darwin-arm64`,
  etc.) is a step 3b follow-up — esbuild / swc / esm follow this
  layout and it scales cleanly.
- **CLI args proxied unchanged.** Wrapping `--help` / `--version`
  at the Node layer (so they don't pay JVM startup) is a future
  ergonomic — the current path is "Node → java spawn" with zero
  arg massaging, which keeps the contract tight.

### Sizes

| Component | Size |
| --- | --- |
| Total staged `dist/` | ~375 MB |
| layoutlib-resources (framework XML) | ~113 MB |
| Bundled fonts (Noto + Roboto family) | ~86 MB |
| ICU data | ~27 MB |
| Per-platform layoutlib native libs | ~15 MB |
| Renderer + dep jars | ~25 MB |

Future trimming candidates: subsetting Noto to common scripts
saves ~70 MB; the framework resources XML is mostly drawables we
don't render and could be pruned. Defer until a real distribution
constraint surfaces.

### Smoke tests (single host, mac-arm)

- One-shot via wrapper: `cat fixture.json | rn-quick-render.js --output foo.png` → PNG written, ~5 s cold.
- Batch via wrapper: 3 entries × 2 device profiles → 1.2 s wall (689 ms init + 242 ms render), same arithmetic as `:renderer:run` minus Gradle daemon overhead.
- Java < 17 detection: spoofed `JAVA_HOME` pointing at a JDK 8 install → errors with "requires Java 17+, found 1.8.0_…".
- Missing staged `dist/`: deleted the directory → wrapper errors with "package is missing its staged runtime" + the `gradle` command to fix.

### Step 3a — Linux cross-target (✅ landed)

Mac-arm hosts can now stage a linux-x64 npm bundle without
needing a Linux machine. Pipeline:

- `./gradlew :renderer:packageForNpm -Ptarget=linux` triggers
  the `linux` target spec (a per-target `PackageTargetSpec`
  selects the right Yoga build task, layoutlib extract task,
  and output dir).
- `layoutlibRuntimeLinux` configuration carries the
  `org.gradle.native.operatingSystem=linux` /
  `architecture=x86-64` attributes that resolve to the linux
  variant of the per-OS `layoutlib-runtime` artefact, regardless
  of build host.
- `cmakeBuildLinux` task runs `docker run --platform linux/amd64`
  against `rn-quick-render/yoga-linux:cmake-ubuntu22` — a small
  Ubuntu 22.04 image with `cmake`, `g++`, and `openjdk-17-jdk`
  baked in. The yoga source + project's CMakeLists are mounted
  read-only at `/work` so the existing relative `../../yoga`
  reference resolves; `libyoga.so` lands back on the host.
- Output stages to `npm-cli/dist-linux/` (per-target dir so
  cross-target builds don't stomp each other). The Node wrapper
  detects the runtime host and looks for `dist-<host>/` first,
  falling back to `dist/` for the published-package layout.

Smoke test: built `dist-linux/` on mac-arm, then mounted it into
a `node:20-bookworm-slim` + `openjdk-17-jre-headless` container
and ran the wrapper against `blueskyOnboardingInterests.json`.
PNG rendered cleanly, pixel-identical to the mac-arm render at
the same fixture.

Sizes (`dist-linux/`): 376 MB total, same shape as `dist-mac-arm/`.

Gotchas captured along the way:

- `openjdk-17-jdk-headless` strips AWT, but CMake's `FindJNI`
  module insists on `JAVA_AWT_LIBRARY`. Costs ~80 MB image bloat
  to use the full JDK — bypassing the FindJNI check would
  require patching Yoga's CMakeLists and drifting from upstream.
- The mounted yoga source path matters: `renderer/cmake/CMakeLists.txt`
  uses `${CMAKE_CURRENT_SOURCE_DIR}/../../yoga`, so the container
  needs the full repo root mounted at a single point (`/work`)
  rather than `cmake/` and `yoga/` mounted separately.
- Stale CMake build dirs blow up with "source does not match
  the source used to generate cache" when the mount layout
  changes. `packageForNpm` doesn't auto-clean its yoga build
  dir — manual `rm -rf renderer/build/yoga-native-linux/` if
  the layout shifts.

### Open

- Multi-platform layout (3b) — per-platform sub-packages with
  `optionalDependencies`. Linux-x64 (just landed) + mac-arm +
  mac-x64 + win-x64.
- Publish to npm (3c) — needs CI matrix that runs
  `packageForNpm -Ptarget=<each>` and uploads each as a
  per-platform package.
- linux-arm64 — layoutlib-runtime only ships x86_64 for linux,
  so this would need a different layoutlib build entirely (out
  of scope for now).

## Step 4 — daemon mode (⏳, deferred)

`serve` mode: one long-running JVM, thin client talks over a
unix socket or HTTP. Amortises `Bridge.init()` across CLI
invocations over time.

Defer until a real workflow demands it. `--batch` already
covers the matrix / CI fan-out case. The use case the daemon
adds value for is rapid iteration on a single fixture where
5 s of cold-start is the bottleneck (e.g. tweaking ALF atoms
and re-rendering on every save). Probably better solved at
that point by a watch-mode wrapper around `--batch`.

Tradeoffs to weigh when this lands:

- Lifecycle complexity — warm-up, idle shutdown, crash
  recovery, stale-cache invalidation when the renderer binary
  is rebuilt.
- IPC contract — JSON over unix socket is fine for a v1; HTTP
  brings nicer tooling (curl, browser inspect) at the cost of
  port management.
- Multi-process safety — if two clients connect concurrently,
  do we serialise renders or run them in parallel (re-using one
  Bridge instance per thread)? Layoutlib's `RenderSession`
  thread-safety is an open question; needs a probe before
  committing.

## Step 5 — snapshot-diff tooling integration (⏳)

The committed PNGs are great as goldens but their value
multiplies when wired into a diff tool that highlights what
changed. Candidates:

- Existing CI tools (Reg-suit, Percy, Chromatic) — most are
  oriented toward web screenshots but the PNG output is
  agnostic.
- Roll a thin pixel-diff with side-by-side HTML — already
  partially in `SnapshotRendererTest.compareImages`, just
  needs presentation.

## Step 6 — docs + failure modes + CI examples (⏳)

The thing that turns "an interesting prototype" into "a tool
someone else can adopt". Out of scope for now; revisit once
steps 1–5 stabilise.
