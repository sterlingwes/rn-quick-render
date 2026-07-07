# Roadmap

Forward-looking backlog for both engines. How the system works lives in
[`architecture.md`](architecture.md); how to use it lives in the
[README](../README.md) and [`rendering-real-apps.md`](rendering-real-apps.md).

## Where the project is

- **Capture front-end (`rn-harness/`)** — solid. Fabric capture in pure
  Node, real-app boot with a 3-tier native-module shim, curated default
  mock pack, multi-frame + Suspense capture. Proven against four
  screens of a real OSS app (bluesky), including device / font-scale /
  theme matrices.
- **Android engine (`renderer/` + `npm-cli/`)** — works end-to-end with
  strong fidelity (spans, images, transforms, shadows, custom fonts,
  update path). `--batch` amortises JVM bootstrap (~9× wall-clock on a
  small matrix); an npm CLI wrapper and linux cross-staging exist but
  nothing is published. RTL is the one notable fidelity gap.
- **iOS engine (`npm-cli-ios/`)** — pre-alpha. CLI verbs work against a
  running `rn-ios-render-server`; fidelity goldens committed.

## Priorities (Android track)

Ordered by what most changes adoption, not by what was planned first.

### 1. In-test capture (Jest integration)

The single biggest lever on "painless": capture snapshots from inside
an app's existing Jest suite, where the app's own mocks already tame
the module graph — instead of hand-porting mocks per target. Also the
cheapest path to a large, high-fidelity stress-test corpus from OSS
apps. Design and status:
[`proposals/jest-capture.md`](proposals/jest-capture.md).

**Built (pre-alpha):** the [`npm-jest/`](../npm-jest) package
(`screenSnapshot`, per-scheme capture, lazy shims; green on RN
0.83–0.85 under each stock preset via the `jest-capture` CI matrix)
and the `rn-quick-render verify` render/diff subcommand
(manifest merge + filtering → one warm `--batch` render → pixel diff,
`--record` to bless). The JVM-in-the-loop `verify` cycle and
ScrollView wrapper synthesis are done and validated against real
renders. **Remaining:** an OSS-app end-to-end, npm publish.

### 2. RN version compatibility

The harness pins one RN version; the capture stub tracks Fabric
internals. In-test capture makes consumers' RN versions our problem
immediately, but the risk exists today for anyone cloning the repo
against a different app. Needed: a version-matrix CI job across recent
RN minors, a documented support range, and an actionable error outside
it.

### 3. Distribution

Prerequisite for anyone using this without cloning the repo:

- Per-platform npm sub-packages (`optionalDependencies` layout —
  linux-x64 staging already works via Docker) and an npm publish
  pipeline.
- Size trimming: the staged runtime is ~375 MB (Noto subsetting saves
  ~70 MB; layoutlib's framework XML is mostly drawables we never
  render).
- The iOS package's `file:` dependency on `rn-harness` won't resolve
  post-publish — publish the harness (or bundle it) as part of the same
  pass.

### 4. Capture normalization

Renumber `reactTag`s to a canonical per-capture sequence. Kills the
"fixtures must be appended in order or every golden shifts" fragility,
makes captures cacheable/diffable, and is a prerequisite for capture
inside arbitrarily-ordered test suites. **The utility landed**
(`rn-harness/src/normalizeCapture.ts`) and is now applied by every
harness capture path — the committed `rn-harness/out/` goldens are
re-captured in normalized form, the full harness suite and the
renderer's PNG golden suite both pass against them, and the old
"append fixtures at the end or every golden shifts" rule is gone.
`synthesizeScrollContentViews` (canonical ScrollView shape for
Jest-preset captures) is render-validated. **Done.**

### 5. Fidelity: RTL

The Yoga root hard-codes `DIRECTION_LTR`. Expose direction through to
`YogaConfig.setLayoutDirection` and `TextView.layoutDirection`, add a
mirrored fixture, then extend the matrix with an RTL/locale axis. RTL
surfaces edge-aware style handling (`marginStart`/`marginEnd`) that
nothing else exercises.

### 6. Multi-frame surfacing

Capture already delimits frames (`completeRoot` per commit); both
engines currently replay to the terminal frame and emit one image. The
work is consumer-side: opt-in "one render per commit" so a Suspense
fallback or update sequence can be snapshotted individually.

Design sketch (agreed, not built):

- **Opt-in, single-frame default.** Back-compat, cost, and signal/noise
  all argue against making everyone pay; a render-time flag opts in.
- **Capture format unchanged** — `completeRoot` already delimits
  frames.
- **Split engine-side, reuse one warm surface** rather than POSTing /
  piping N copies of the stream.
- **Additive response**: existing single-image semantics stay; an
  optional `frames: [{ index, url, … }]` appears when opted in. Both
  engines report `frameCount` on every render so multi-frame content is
  discoverable instead of silently dropped.
- Open: wire-field naming; output naming pattern for `--out` under
  multi-frame.

### Deprioritised (was planned, needs a driver before building)

- **Perf benchmark vs. emulator baseline** — worth doing before any
  public claim, but the ~9× batch amortisation and ~100 ms warm renders
  already validate the approach internally.
- **Parallel matrix execution** — sequential JUnit is fine at current
  matrix sizes; revisit when a real corpus (see priority 1) makes wall
  clock hurt. `RenderSession` thread-safety is the open question.
- **Gradle plugin** — designed as a developer front door; if the Jest
  integration lands, RN developers get a front door where they already
  live. Defer until a JVM-side consumer asks.
- **Daemon mode** — the deferred-batch model covers CI. The use case
  that revives it is inline `toMatchScreenSnapshot()` matchers
  (see the Jest proposal) or rapid single-fixture iteration.
- **Snapshot-diff tooling integration** (Reg-suit / Percy / side-by-side
  HTML) — valuable at adoption time; the Jest integration's verify step
  will produce the diff report v1.

## Priorities (iOS track)

1. **Publish-time packaging** — shared with Android priority 3.
2. **Single-source the DSL** — `npm-cli-ios/src/dsl.ts` is a hand-copy
   of `rn-harness/fixtures/_dsl.ts`; extract so it can't drift.
3. **Multi-frame surfacing** — same design as above; the iOS payload
   currently flattens frames to one `instructions` array.
4. **Harden the server contract** — pin/version the
   `rn-ios-render-server` HTTP API the CLI depends on.

## Housekeeping

- CI workflows are still named `phase-1-rn-harness.yml` /
  `phase-2-renderer.yml`; rename to `capture.yml` / `renderer.yml` next
  time they're touched (path filters unchanged).
- The renderer's Kotlin package is `com.example.renderer` — rename
  before anything is published.
