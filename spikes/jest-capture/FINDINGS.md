# Spike: Fabric capture inside a consumer app's stock Jest setup

**Verdict: GO — and since productized.** Fabric mount-instruction
capture works inside a consumer-shaped Jest environment
(`@react-native/jest-preset`, no harness config), inherits the test's
`jest.mock`s, and emits an artifact byte-compatible with the JVM
renderer's input contract. Two small shims were needed, both
packageable as a setup file.

The prototype described below graduated into the
[`npm-jest/`](../../npm-jest) package (`rn-quick-render-jest`); this
directory is now its consumer-shaped test bed, and
`run-matrix-probe.js` re-runs the suite against other RN versions
(green on 0.83.10 / 0.84.1 / 0.85.1 — see the `jest-capture` CI
workflow). The render/diff side is `rn-quick-render verify` in
[`npm-cli/`](../../npm-cli).

This validates risk #1 of [`docs/proposals/jest-capture.md`](../../docs/proposals/jest-capture.md)
(preset interactions) and the two-step model: the Jest run writes
renderable artifacts + a manifest, and rendering is a separate step a
CI pipeline can filter (e.g. only components that changed).

## Environment

- react-native 0.85.1, react 19.2.5, react-test-renderer 19.2.0
- jest 29.7.0 with `preset: "@react-native/jest-preset"` (0.85.1) —
  note RN 0.85 moved the preset out of the `react-native` package;
  `preset: "react-native"` now throws a migration error
- Node 22, plain `babel.config.js` with `@react-native/babel-preset`

Run it: `npm install && npx jest` in this directory. Artifacts land in
`__screensnaps__/` (one JSON per snapshot + a JSONL manifest per Jest
worker). A committed example artifact and manifest are checked in so
the render leg can be exercised without re-running the suite.

## What worked with zero intervention

- **`ReactFabric-dev` boots with the real private modules.** The
  harness swaps `ReactNativePrivateInterface` and
  `ReactNativePrivateInitializeCore` to run under bare Node; under the
  consumer's Jest preset the *real* modules load fine. No
  `moduleNameMapper` entries, no custom resolver, no transform config.
  The only bootstrap the capture API does itself is installing the
  `nativeFabricUIManager` recorder global (plus `RN$Bridgeless` /
  act-environment flags if unset) before requiring `ReactFabric-dev`.
- **The consumer's mocks apply to the capture.** The test
  `jest.mock`s a data hook whose real implementation throws; the
  captured stream contains the mocked value ("3 unread messages").
  Same module registry, same mocks — the core premise holds.
- **The artifact is renderer-ready as captured.** Same top-level shape
  as `rn-harness/out/*.json` (`fixture` / `surfaceId` /
  `instructionCount` / `instructions`), same op vocabulary, raw color
  strings (`"#D81B60"`, not processed ints), raw style objects.
- **Coexistence with the test's own renderer.** The same test file
  renders via react-test-renderer first and captures via Fabric after;
  no interference either way.

## The two shims (the packaged setup file, essentially)

1. **`NativeDOM` TurboModule mock.** RN 0.85's Fabric root creation
   goes through `ReactNativeDocument`, which calls the `NativeDOMCxx`
   TurboModule — `null` under the Jest preset, so the first render
   throws in `linkRootNode`. A no-op mock suffices; capture never uses
   DOM APIs.
2. **View configs for the preset's component mocks.** The preset mocks
   View / Text / Image / ScrollView / TextInput / Modal /
   ActivityIndicator with classes that render host elements *named
   after the component* (`'View'`, not `'RCTView'`). Fine for
   react-test-renderer; Fabric requires a registered view config per
   host name. Registering permissive configs whose `uiViewClassName`
   is the corresponding RCT class name fixes the crash **and**
   normalizes the emitted stream — `createNode` records the RCT name,
   so the artifact is indistinguishable from a real-RN capture at the
   node level. `validAttributes` is a pass-everything proxy that
   excludes `children`/`ref`/`key`, mirroring the harness's capture
   semantics (the renderer's `StyleFlattener` handles raw styles).

## Warts and open questions

- **Text-nesting DEV warning.** Fabric's "text strings must be inside
  <Text>" check keys on literal host names (`RCTText` et al). The
  preset's Text mock emits `'Text'`, so every string child logs a
  spurious `console.error` even though the captured tree is correct
  (`RCTRawText` under `RCTText`). The spike scope-filters that one
  message around the render call. Cleaner fixes all have costs — an
  upstream RN change, or overriding the preset's Text mock (rejected:
  it would rename nodes in consumers' existing RTR snapshots).
- **ScrollView shape (resolved).** Two distinct issues hid here. The
  static analysis predicted sibling-dropping from a single-node mock;
  in fact the preset's ScrollView mock wraps children in a plain
  `<View>` (so ordinary children survive — the drop only threatens the
  `refreshControl` slot). The *actual* runtime failure was different:
  the mock emits its host element under the native name
  (`requireNativeComponent('RCTScrollView')`), which had no registered
  view config. Fixed twice over: the registry `get` is wrapped to
  auto-register a permissive identity config for any unknown host name
  (the same policy the in-repo harness uses), and
  `synthesizeScrollContentViews` (in `normalizeCapture.ts`) inserts
  the canonical `RCTScrollContentView` wrapper so artifacts match the
  real-RN shape. Validated end-to-end: the `ActivityFeed` capture
  renders all three rows through the JVM (pixel-checked).
- **TextInput / Modal / ActivityIndicator** are mapped naively
  (`RCTTextInput` isn't a renderer-supported type; Modal/AI map to
  plain views). Fidelity for these is placeholder-level, matching the
  default-mock philosophy.
- **Render leg: done.** With network access restored, the yoga
  submodule + JDK 17 unblocked the JVM renderer and the full loop ran
  in this repo: Jest capture → `rn-quick-render verify --record` →
  byte-exact re-`verify` → `--filter` subset. 7 snapshots (2 devices ×
  2 font scales + light/dark + ScrollView) render in one warm JVM,
  ~3.6 s wall including 2 bootstraps. Reference goldens are committed
  under `__screensnaps__-goldens/`. Two environment finds along the
  way: the CLI's Java-version probe read only the first stderr line,
  which breaks when `JAVA_TOOL_OPTIONS` is set (common in CI) — fixed
  in `lib/launcher.js`; and layoutlib's `BitmapFactory` rejects some
  hand-minified 1×1 PNGs while well-formed encoder output decodes fine
  (keep test-fixture data URIs encoder-generated).
- **RN version coverage.** Originally 0.85.1 only; now green on
  0.83.10 / 0.84.1 / 0.85.1 via `run-matrix-probe.js` (CI-enforced by
  the `jest-capture` workflow). The `NativeDOM` shim self-skips on
  versions without the module, which is what makes the older minors
  work unchanged.

## Landed after the initial spike: capture normalization

`rn-harness/src/normalizeCapture.ts` renumbers `reactTag`s (by first
appearance, to Fabric's even-numbered 2, 4, 6… convention) and
`surfaceId`s (to 1, 2, …) so an artifact is a pure function of the
rendered element rather than of process history. `screenSnapshot`
applies it before writing, and the suite includes an empirical
order-independence test: capturing the same element twice — where raw
Fabric tags necessarily differ — produces identical instruction
streams. This is the same fragility that forced append-only fixture
ordering in the harness repo — since eliminated there too: every
harness capture path canonicalizes, the committed goldens are
re-captured in normalized form, and the renderer's PNG suite confirmed
the renumbering is pixel-neutral.

## Packaging lessons (learned the hard way)

Two failure modes surfaced while extracting the package, both about
`file:` installs and worth remembering for the publish pass:

- **npm auto-installs peer deps into the package's own node_modules.**
  `rn-quick-render-jest` declares `react-native` as a peer; a plain
  `npm install` in the package dir pulled in react-native **0.86** —
  and under RN 0.85's preset the `moduleNameMapper` silently redirected
  every RN require to the consumer's copy, masking the problem. Under
  RN 0.84 (whose in-package preset has no such mapping) the package's
  own 0.86 copy loaded, unmocked, and exploded with
  `__fbBatchedBridgeConfig is not set`. Fix: `legacy-peer-deps=true` in
  the package's `.npmrc` — the package must never carry its own RN.
- **`file:` symlinks put the dist outside node_modules' real path**, so
  the consumer's babel transform rewrites it (injecting
  `@babel/runtime` helpers it can't resolve) and module resolution
  walks the wrong tree. Fix: `install-links=true` in consumers of the
  in-repo package — npm copies it into node_modules, matching the
  published layout. Published installs never hit either problem.

## Cost observations

Whole suite (RTR test + capture test) runs in ~0.8 s warm on this
container; the capture test itself ~100–200 ms including the lazy
`ReactFabric-dev` require. Per-test-file Fabric bootstrap is not a
practical concern at this scale; worth re-measuring inside a large app
where the transform cache is the dominant term.

## What the package needs (sharpened by this spike — all since built)

- ~~A `setupFiles` module with the two shims~~ → shipped as lazy-by-default
  shims in `npm-jest/src/shims.ts`, with an optional
  `rn-quick-render-jest/setup` entry for apps that touch RN DOM APIs
  before the first capture.
- ~~`screenSnapshot(element, opts)` writing artifact + per-worker JSONL
  manifest entries~~ → `npm-jest/src/index.ts`, including per-scheme
  capture via `colorSchemes` (overrides RN's `useColorScheme()` hook,
  `__dark`-suffixed artifacts).
- ~~A `render`/`verify` CLI step~~ → `rn-quick-render verify`
  (`npm-cli/lib/verify.js`), unit-tested with an injected fake renderer
  (`npm-cli/test/verify.test.js`); the JVM leg still needs a machine
  that can build the renderer.
- The hollow-stream guard (`captured no host components`) proved
  useful during the spike itself; kept.
