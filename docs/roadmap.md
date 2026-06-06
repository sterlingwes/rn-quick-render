# Roadmap — two engines, one front-end

This is the living, forward-looking index for the project. The numbered
`phase-*.md` docs remain the historical design rationale for the Android
engine; this doc supersedes their scattered "next steps" sections as the
single source of truth for **what's next**.

## The model

```
React component (.tsx fixture)
        │  rn-harness: loadFabric / loadRealRn
        │             + default mock layer  (src/defaultMocks/registry.js)
        │             + concurrent / multi-frame capture  (renderFrames)
        ▼
Fabric mount-instruction JSON   ← the shared contract
        │
        ├──────────────► Android engine            in-process JVM
        │                npm-cli/ + renderer/       YogaLayoutEngine + layoutlib → PNG
        │
        └──────────────► iOS engine                HTTP
                         npm-cli-ios/               POST → rn-ios-render-server → simulator → PNG
```

One Node harness captures the mount-instruction stream; two engines render
it. The stream is the contract. A fixture authored once can be snapshotted
on both platforms, and a mock written once (`src/defaultMocks/`) serves both.

## What's landed

**Shared front-end (`rn-harness/`)**
- Fabric capture in pure Node; real-app boot (`loadRealRn`) + 3-tier
  native-module shim. Design: [`phase-2-translator.md`](phase-2-translator.md),
  [`phase-3.md`](phase-3.md).
- Concurrent / multi-frame capture — `renderFrames()`, `suspendedText`
  fixture. Per-frame synchronous commit preserved.
- Default mock layer — curated placeholder pack for heavy RN libs + opt-in
  `RN_HARNESS_AUTOMOCK_UNRESOLVED` catch-all, behind a shared `registry.js`.

**Android engine (`npm-cli/`, `renderer/`)** — Phases 0–3 done; 2.5 nearly
done (RTL open); Phase 4 partial (device/font/theme matrices); Phase 5 partial
(`--batch`, npm wrapper, linux cross-target). Detail:
[`phase-4.md`](phase-4.md), [`phase-5.md`](phase-5.md).

**iOS engine (`npm-cli-ios/`)** — pre-alpha. CLI verbs (capture / render /
snapshot / matrix / diff) work against a running `rn-ios-render-server`;
light/dark + xxxl fidelity goldens committed.

## What's next (re-sequenced, by track)

### Shared front-end
1. **Multi-frame surfacing.** A "frame" is a Fabric commit, already delimited
   in the captured stream by a `completeRoot` op (`rn-harness/src/types.ts`).
   Capture supports multiple frames — explicit (`renderFrames([...])`) or
   emergent (`renderConcurrent` emits a Suspense fallback commit then a
   resolved commit). The gap is **consumer-side, not a capture-format
   problem**: both engines replay the whole stream to the terminal child set
   (each `completeRoot` replaces the surface's children, so the last one wins
   → one image), and the iOS payload ships the flat `instructions` array as-is
   (`npm-cli-ios/README.md`). The work is to split on `completeRoot` (or group
   the stream into `frames`) and have each engine emit one render per commit —
   so a Suspense fallback and its resolved state, or each step of an update,
   can be snapshotted individually.
2. **Single-source the DSL.** `npm-cli-ios/src/dsl.ts` is a hand-copy of
   `rn-harness/fixtures/_dsl.ts`. Publish/extract the harness DSL so the iOS
   package imports it instead of drifting.

### Android engine
1. **RTL** (Phase 2.5 #6) — Yoga root is still hard-coded `DIRECTION_LTR`.
   Unblocks the Phase 4 locale/RTL matrix (#3b).
2. **Perf baseline vs emulator** (Phase 4 #4) — cold vs warm p50/p95 per
   fixture+device; compare against Phase 0's Paparazzi numbers.
3. **Parallel matrix execution** (Phase 4 #5) — currently sequential per
   JUnit method; `RenderSession` thread-safety is the open question.
4. **Packaging** (Phase 5) — Gradle plugin (#2), per-platform npm
   sub-packages + publish (#3b/#3c), snapshot-diff tooling (#5).

### iOS engine
1. **Out of pre-alpha** — close the multi-frame surfacing gap (above).
2. **Publish-time packaging** — the `rn-harness` `file:` dep won't resolve
   for end users; either publish `rn-harness` or bundle it into `dist/`
   (`npm-cli-ios/README.md`).
3. **Harden the server contract** — pin / version the `rn-ios-render-server`
   HTTP API (`POST /renders`, `/assets`) the CLI depends on.

## Picking the next piece of work

These tracks are independent — choose by goal:
- **Cross-platform fidelity now:** do shared-front-end #1 (multi-frame
  surfacing), which unblocks animated fixtures on both engines.
- **Ship the Android engine:** Phase 5 packaging + Phase 4 perf/parallel.
- **Mature the iOS engine:** iOS #1–#3, in order.

Whatever is chosen, update the relevant phase doc's status table and this
roadmap so the written record stays current.
