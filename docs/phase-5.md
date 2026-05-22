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

## Step 3 — npm CLI wrapper (⏳)

The natural distribution target for React Native dev workflows.
Ships a thin Node CLI that:

- Locates or downloads a packaged JVM + the renderer jar
- Forwards args to the same `Main.kt` entry point
- Optionally manages a long-running JVM in step 4 (daemon mode)

Open questions:

- JVM bundling strategy — `jlink` to ship a minimal JDK, or
  require system Java 17+?
- Native lib distribution — layoutlib's native libs are
  platform-specific (mac-arm / mac / linux / win); pick at
  install time or download lazily?
- npm package layout — single `rn-quick-render` with platform
  binaries inside, or platform sub-packages
  (`@rn-quick-render/darwin-arm64` etc) the main package depends
  on?

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
