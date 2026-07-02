# Spike: Fabric capture inside a consumer app's stock Jest setup

**Verdict: GO.** Fabric mount-instruction capture works inside a
consumer-shaped Jest environment (`@react-native/jest-preset`, no
harness config), inherits the test's `jest.mock`s, and emits an
artifact byte-compatible with the JVM renderer's input contract. Two
small shims were needed, both packageable as a setup file.

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
- **ScrollView shape.** The preset's ScrollView mock renders a single
  host node — no `RCTScrollContentView` child the real component
  emits. The renderer expects the pair; needs a probe (either tolerate
  direct children in `FabricViewBuilder` or synthesize the content
  view at capture normalization time).
- **TextInput / Modal / ActivityIndicator** are mapped naively
  (`RCTTextInput` isn't a renderer-supported type; Modal/AI map to
  plain views). Fidelity for these is placeholder-level, matching the
  default-mock philosophy.
- **Render leg not executed here.** This sandbox can't reach
  github.com to fetch the yoga submodule, so the PNG step wasn't run.
  The artifact is contract-identical to committed goldens; render it
  locally with
  `cat spikes/jest-capture/__screensnaps__/inboxCard.json | npm-cli/bin/rn-quick-render.js --output /tmp/inboxCard.png`.
- **Single RN version.** 0.85.1 only. The `NativeDOM` shim is
  version-sensitive by nature (it exists *because* 0.85 routes roots
  through the DOM layer) — exactly the kind of thing the proposed
  version-matrix CI must cover.

## Cost observations

Whole suite (RTR test + capture test) runs in ~0.8 s warm on this
container; the capture test itself ~100–200 ms including the lazy
`ReactFabric-dev` require. Per-test-file Fabric bootstrap is not a
practical concern at this scale; worth re-measuring inside a large app
where the transform cache is the dominant term.

## What the package needs (sharpened by this spike)

- A `setupFiles` module with the two shims (replaces the earlier
  assumption that we'd need `moduleNameMapper` entries — we don't).
- `screenSnapshot(element, opts)` writing artifact + per-worker JSONL
  manifest entries (`__screensnaps__/` here; name TBD).
- A `render`/`verify` CLI step that merges manifests → `--batch`
  manifest → PNG diff, with record mode and name/path filtering for
  CI.
- The hollow-stream guard (`captured no host components`) proved
  useful during the spike itself; keep it.
