# Proposal: capture snapshots from inside an existing Jest suite

**Status: built (pre-alpha).** The capture spike passed and the design
below is now implemented:

- **[`npm-jest/`](../../npm-jest)** — `rn-quick-render-jest`, the
  capture package (`screenSnapshot` + lazy environment shims +
  per-scheme capture). Green against RN 0.83.10 / 0.84.1 / 0.85.1
  under each version's stock Jest preset (`jest-capture` CI workflow).
- **`rn-quick-render verify`** — the separate render/diff step in
  [`npm-cli/`](../../npm-cli): manifest merge + filtering → one warm
  `--batch` render → pixel diff, with `--record`.
- Spike evidence and packaging lessons:
  [`spikes/jest-capture/FINDINGS.md`](../../spikes/jest-capture/FINDINGS.md).

Not yet done: a JVM-in-the-loop run of `verify` (needs a machine that
can build the renderer), ScrollView content-wrapper synthesis, an OSS
app end-to-end, and publishing. The rest of this doc is the design
rationale.

## Problem

Today, rendering a component from a real app means authoring a fixture
against the harness's mocking pattern: hand-mocking the app's
providers, theme system, and any library the default mock pack doesn't
cover (see [`rendering-real-apps.md`](../rendering-real-apps.md)).
That's the intended usage — consumers follow the same pattern in their
own repo once the library is published; the in-repo bluesky fixtures
are the reference implementation of it. But the bluesky fixtures also
show what the pattern costs per target — a faithful `Button` slice, an
`alf` theme mock, a `@lingui` macro stack — and for any app with a
working test suite, that cost re-creates mocking work its Jest setup
has already done.

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

- **A `setupFiles` module.** The spike showed the integration surface
  is smaller than first assumed — no `moduleNameMapper` entries, no
  resolver: `ReactFabric-dev` boots with RN's *real* private modules
  under the consumer's preset. What the setup file ships is (a) a
  no-op mock for the `NativeDOM` TurboModule (null under the Jest
  preset, but Fabric root creation calls it on RN 0.85), and (b)
  permissive view-config registrations that translate the preset's
  mocked component host names (`'View'`, `'Text'`, …) to the RCT class
  names, so the emitted stream matches a real-RN capture at the node
  level.
- **`screenSnapshot(element, opts)`** — captures the mount-instruction
  stream (multi-frame and concurrent shapes included), applies
  `setColorScheme` per requested scheme, normalizes it, and writes
  `__screensnaps__/<name>.json` plus a manifest entry for the
  requested device × fontScale matrix.
- **A separate render/verify CLI step** that consumes those artifacts.

### Two distinct steps: tests emit consumables, rendering is separate

The Jest run's only output is **renderable artifacts**: per-snapshot
mount-instruction JSON (mocks already applied, exactly the JVM
renderer's input shape) plus per-worker JSONL manifest lines
(`{name, input, testPath, devices, fontScales}`). Nothing renders
during the test run — capture is pure JS and costs milliseconds, so
tests stay fast, and `Bridge.init()` (~4 s per device profile) is
never paid inside a test.

Rendering is an explicit second call — `rn-quick-render verify` (or
raw `--batch`) — that merges the manifests, fans out the device/font
matrix over one warm JVM, pixel-diffs against committed goldens, and
supports a record mode mirroring `-Drenderer.record=true`.

Keeping the steps decoupled (rather than hiding the render step in a
Jest `globalTeardown` hook) buys:

- **Filtering.** The render step can select a subset by name, test
  path, or anything derivable from the manifest — e.g. CI renders only
  components whose source changed, while the full capture set stays
  cheap to emit on every run.
- **Portability.** The artifacts are plain files; they can be rendered
  on a different machine (or engine — the same JSON feeds the iOS
  engine), cached, or diffed without Jest in the loop.
- **No Jest lifecycle coupling.** Nothing breaks under watch mode,
  sharding, or partial runs; a teardown-triggered render would fire on
  every watch iteration.

A `globalTeardown` convenience wrapper can still be offered for
one-command local workflows, but it's sugar over the CLI step, not the
mechanism. If inline `expect(...).toMatchScreenSnapshot()` ergonomics
prove necessary later, that's what would finally justify the
deliberately-deferred renderer daemon mode — the matcher awaits a
render from a long-lived warm JVM. Build the artifact path first; the
daemon path shares all its parts.

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
fragility in our own repo.

**Landed**: `rn-harness/src/normalizeCapture.ts` renumbers tags and
surface ids to a canonical per-capture sequence; the spike's
`screenSnapshot` applies it and proves order-independence empirically
(same element captured twice → identical artifacts). Still open:
adopting it for the committed `rn-harness/out/` goldens (a full
re-capture, needs the bluesky submodule), and extending the
normalization pass to synthesize the `RCTScrollContentView` wrapper
that the Jest preset's single-node ScrollView mock omits — without it,
`FabricViewBuilder.buildScrollView` paints only the first direct child
and silently drops siblings (same gap applies to the iOS engine, which
is why the fix belongs capture-side).

## Risks and open questions

Roughly in order of how much they threaten the idea:

1. **RN version skew.** In-repo capture pins one RN version
   (0.85.1 today); in-consumer capture uses *their* RN. The capture
   stub tracks Fabric internals that move between releases. This is
   the project's largest pre-existing architectural risk, and this
   proposal converts it from latent to immediate. **Mitigated so
   far:** the consumer suite is green on 0.83.10 / 0.84.1 / 0.85.1
   with zero per-version code (the NativeDOM shim self-skips when the
   module doesn't exist), enforced by the `jest-capture` workflow's
   version matrix. Widening/documenting the supported range tracks
   with that matrix; a loud, actionable error outside it is still to
   do.
2. **RN Jest preset interactions.** ~~Whether `ReactFabric-dev` boots
   cleanly under the stock preset needs a spike.~~ **Resolved (GO)** —
   see [`spikes/jest-capture/FINDINGS.md`](../../spikes/jest-capture/FINDINGS.md).
   Two shims needed (NativeDOM mock + view configs for the preset's
   mocked component names); real private modules load as-is. Still
   open from that spike: the preset's single-node ScrollView mock vs.
   the renderer's `RCTScrollView`/`RCTScrollContentView` pair, a
   spurious text-nesting DEV warning (currently scope-filtered), and
   repeating the exercise under Expo (`jest-expo`) and a real OSS
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

1. ~~Spike risk #2: boot Fabric capture inside a fresh RN app's Jest
   suite with the app's default preset.~~ **Done — GO**
   ([`spikes/jest-capture/`](../../spikes/jest-capture/)).
2. Render the spike artifact through the JVM renderer to close the
   loop (blocked in the spike sandbox by network policy; one local
   command). ~~Probe the ScrollView single-node shape~~ — probed
   statically: only the first direct child paints; fix via
   normalization-time wrapper synthesis (above).
3. ~~Land capture normalization (tag renumbering) in the harness.~~
   **Done** — `normalizeCapture.ts` + unit tests; golden migration
   deferred to a re-capture pass.
4. ~~Extract the capture core into the publishable package.~~ **Done**
   — [`npm-jest/`](../../npm-jest), bundling the harness capture core
   so there's one source of truth and no `file:` dependency at publish
   time.
5. ~~The `verify` render/diff CLI step over `--batch`, with record
   mode and manifest filtering.~~ **Done** — `npm-cli/lib/verify.js`,
   unit-tested with an injected renderer; still needs one
   JVM-in-the-loop run on a machine that can build the renderer.
6. ~~RN version-matrix CI.~~ **Done** — `jest-capture` workflow runs
   the consumer suite against 0.83 / 0.84 / 0.85.
7. Run it against one OSS app end-to-end; feed the resulting captures
   into the renderer's stress-test corpus. (Needs network access to
   clone the app — first environment-unblocked follow-up, together
   with the render leg.)
