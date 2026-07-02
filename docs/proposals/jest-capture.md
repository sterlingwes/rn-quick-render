# Proposal: capture snapshots from inside an existing Jest suite

**Status: proposed, not built.**

## Problem

Today, rendering a component from a real app means writing a fixture in
*this* repo: hand-mocking the app's providers, theme system, and any
library the default mock pack doesn't cover (see
[`rendering-real-apps.md`](../rendering-real-apps.md)). The
bluesky integration fixtures show the cost — a faithful `Button` slice,
an `alf` theme mock, a `@lingui` macro stack — all re-creating mocking
work the app's own test suite has already done.

Meanwhile, most RN apps already have a Jest suite where components
render successfully: the RN Jest preset, `jest.mock()` calls,
`__mocks__/` directories, and transform config have already tamed the
module graph. The proposal: **run capture inside that environment**,
so wherever a component renders in a test, the developer can also emit
a screen snapshot our renderer consumes.

```ts
// the developer's existing test, in their repo
import { render } from "@testing-library/react-native";
import { screenSnapshot } from "rn-quick-render/jest";

test("inbox renders", async () => {
  render(<InboxScreen {...props} />);          // their existing assertions
  // NEW — capture the same element through Fabric for PNG snapshotting:
  await screenSnapshot(<InboxScreen {...props} />, {
    devices: ["pixel5", "tablet"],
    fontScales: ["default", "a11y"],
    colorSchemes: ["light", "dark"],
  });
});
```

Two payoffs:

1. **Painless adoption.** The mocking burden drops to (approximately)
   zero for apps with a working test suite — their mocks are our mocks.
2. **Cheap stress-testing corpus.** Pointing this at OSS apps means
   running *their* suite with the capture package added, instead of
   git-submoduling the app and hand-porting its theme system. Every
   component their tests render becomes a device/font/theme matrix
   fixture, which is exactly the high-fidelity, screen-sized input the
   renderer needs to be stressed with.

## Why this is architecturally cheap (on the capture side)

Capture needs only the narrow seam the harness already exploits: a fake
`nativeFabricUIManager` global, two `moduleNameMapper` swaps for RN
private internals, and a `ReactFabric.render()` call with synchronous
commit. The harness's own test suite already runs this **under Jest**
(`rn-harness/jest.config.js`) — the proposal is to package that
existing mechanism so it runs under *someone else's* Jest config, with
their RN version and their mocks, rather than only ours.

One thing to be explicit about: we cannot lift pixels out of the render
the test already did. `@testing-library/react-native` renders through a
test renderer, not Fabric — there is no mount-instruction stream to
steal. `screenSnapshot(element)` **re-renders the element through
Fabric in the same module environment**, so it shares every mock and
provider with the test's render but is a second, capture-only render.
The API should take the same element (including wrappers) the test
rendered.

## Design

### Package shape

A `rn-quick-render/jest` entry point in the published package,
consisting of:

- **A preset fragment** the consumer merges into their Jest config
  (or a `withRnQuickRender(config)` wrapper): the two private-module
  `moduleNameMapper` entries, the NativeModules/TurboModuleRegistry
  stubs *as fallbacks* (see mock precedence below), and a
  `globalTeardown` + reporter pair.
- **`screenSnapshot(element, opts)`** — captures the mount-instruction
  stream (multi-frame and concurrent shapes included), applies
  `setColorScheme` per requested scheme, normalizes it, and writes
  `__screensnaps__/<testPath>/<name>.json` plus manifest entries for
  the requested device × fontScale matrix.
- **A render/diff step** that runs once after the suite.

### Deferred rendering, not inline

`Bridge.init()` costs ~4 s per device profile; paying it inside
individual tests is a non-starter. v1 splits the work:

1. **During the test run**: capture only. Pure JS, milliseconds, no
   JVM. Tests stay fast and the API stays synchronous-feeling.
2. **After the suite** (`globalTeardown` or an explicit
   `rn-quick-render verify` CLI step): collect the per-worker
   manifests, run one `--batch` render over a warm JVM, pixel-diff
   against committed PNG goldens, and emit a report (with a
   record mode to bless new goldens, mirroring
   `-Drenderer.record=true`).

The tradeoff is that snapshot failures surface at the end of the run
rather than inline in the test. That's acceptable for v1 and matches
how several visual-testing tools behave (capture in test, compare in
CI step). If inline `expect(...).toMatchScreenSnapshot()` ergonomics
prove necessary, that's what would finally justify the renderer daemon
mode that has been deliberately deferred — the matcher awaits a render
from a long-lived warm JVM. Build the deferred path first; it shares
all its parts with the daemon path.

### Mock precedence

In-repo capture puts our default mock pack first. Inside a consumer's
suite the order inverts:

1. The consumer's `jest.mock()` / `__mocks__` / preset mocks — always
   win. They're the whole point.
2. Our curated placeholder pack — only for modules the consumer didn't
   mock and that would otherwise touch a native binding.
3. The catch-all proxy — opt-in, as today.

Practically this means our entries ship as resolver fallbacks rather
than `moduleNameMapper` overrides wherever possible, so Jest's own
mock resolution runs first.

### Capture normalization

Fabric assigns `reactTag`s monotonically per process, so a stream
captured mid-suite embeds tags that depend on how many captures ran
before it. The renderer doesn't care (tags are only internal
identifiers), but stable JSON artifacts are worth having — for caching,
for diffing, and to kill the existing "append fixtures only at the end"
fragility in our own repo. Capture should renumber tags to a canonical
sequence per capture before writing. This is a small, standalone
improvement worth landing even before the Jest package.

## Risks and open questions

Roughly in order of how much they threaten the idea:

1. **RN version skew.** In-repo capture pins one RN version
   (0.85.1 today); in-consumer capture uses *their* RN. The capture
   stub and `privateInterfaceStub` track Fabric internals that move
   between releases. This is the project's largest pre-existing
   architectural risk, and this proposal converts it from latent to
   immediate. Prerequisite work: a version-matrix CI job that runs
   capture against the last ~4 RN minors, a documented support range,
   and a loud, actionable error outside it.
2. **RN Jest preset interactions.** `react-native/jest-preset` mocks
   native components via `requireNativeComponent` and sets up its own
   NativeModules mocks. Whether `ReactFabric-dev` boots cleanly with
   view configs under that preset (vs. our stub registry) needs a
   spike — it's the first thing to prototype, against a bare
   `npx react-native init` app, then Expo (`jest-expo`), then an OSS
   app.
3. **Degenerate mocks.** A consumer who mocks `react-native` wholesale
   or replaces `View` with a string will capture an empty or misleading
   stream. The capture API should detect obviously-hollow streams
   (e.g. zero host components) and fail with an explanation rather
   than snapshotting a blank PNG.
4. **Per-test-file bootstrap cost.** Jest isolates module registries
   per file, so Fabric re-boots per test file that captures. Needs
   measurement; if requiring `ReactFabric-dev` through babel-jest is
   slow, transform caching should absorb most of it after the first
   run.
5. **Parallel workers.** Manifests must be per-worker files merged at
   teardown (append-contention on one file is not worth solving).
6. **Renderer distribution weight.** "Add a dev-dependency" today means
   a ~375 MB staged runtime plus a JDK 17 requirement. For the
   painless story this proposal exists to tell, packaging stops being
   a background task: per-platform npm sub-packages (or postinstall
   download), Noto subsetting (~70 MB), and framework-resource pruning
   move up the roadmap with it.
7. **What exactly do we hand the renderer for "screen sizes"?** Tests
   render components, not full screens with status bars. The existing
   device profiles already answer viewport sizing; the open question is
   whether `screenSnapshot` should offer a "fill the device viewport"
   wrapper (like the iOS examples' screen container) versus
   size-to-content for component-level captures. Probably both, with
   size-to-content as the default for non-screen components.

## What this displaces

If this lands, some current roadmap items get re-scoped:

- **The Gradle plugin** (packaging step 2) was designed as the
  developer front door for matrix rendering. A Jest-native front door
  serves RN developers where they already are; the Gradle plugin's
  audience shrinks to JVM-side consumers and should be deferred until
  someone asks for it.
- **The bluesky submodule approach** to integration fixtures stays (it
  exercises capture *without* a host test suite, which the CLI path
  still needs), but new stress-testing targets should come through
  OSS-app suites via this package instead of new submodules + hand
  mocks.

## Suggested sequencing

1. Spike risk #2: boot Fabric capture inside a fresh RN app's Jest
   suite with the app's default preset. Go/no-go signal for the whole
   design.
2. Land capture normalization (tag renumbering) in the harness.
3. Extract the capture core into the publishable package with the
   preset fragment + `screenSnapshot` (capture-only, JSON out).
4. The teardown render/diff step over `--batch`, with record mode.
5. RN version-matrix CI.
6. Run it against one OSS app end-to-end; feed the resulting captures
   into the renderer's stress-test corpus.
