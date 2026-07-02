# rn-quick-render

Headless React Native snapshot rendering. Render a React Native
component to a PNG on a plain Linux/macOS machine — no emulator, no
Metro, no Android Gradle Plugin.

```
your component (.tsx) ──► capture (Node) ──► mount-instruction JSON ──► render (JVM) ──► PNG
```

A Node harness boots React Native's Fabric renderer outside any app and
records the mount-instruction stream a real device would receive. That
JSON is then painted through Android's `layoutlib` — the same
Android-on-a-JVM artifact that powers Android Studio's layout preview —
with layout computed by the real Yoga engine and text measured with
Android's real text stack.

Because there's no emulator in the loop, a warm render takes ~100 ms
and a whole device/font-scale/theme matrix runs in seconds.

> **Status: pre-alpha.** The pipeline works end-to-end (including
> screens from a real open-source RN app), but packaging, published npm
> distribution, and the capture API for existing test suites are still
> in flight. See [`docs/roadmap.md`](docs/roadmap.md).

An experimental **iOS engine** (`npm-cli-ios/`) reuses the same capture
front-end and renders on a real iOS simulator via a companion HTTP
service — see [`npm-cli-ios/README.md`](npm-cli-ios/README.md). The
rest of this README covers the Android engine.

## Requirements

- **Node 22** — capture
- **JDK 17+** — rendering
- **CMake + a C++ toolchain** — one-time Yoga JNI build (from-source
  checkout only; not needed once you use a staged `npm-cli/` bundle)
- Git submodules checked out: `git submodule update --init --recursive`

## Quick start

```bash
# 1. Install the capture harness.
npm --prefix rn-harness install

# 2. Capture a fixture to a mount-instruction JSON.
npm --prefix rn-harness run capture     # writes rn-harness/out/*.json

# 3. Render it to a PNG.
cat rn-harness/out/simpleView.json | \
  ./gradlew :renderer:run --args="--output /tmp/simpleView.png" -q
```

Or, skip Gradle at render time by staging the npm CLI once:

```bash
./gradlew :renderer:packageForNpm       # stages npm-cli/dist-<host>/
cat rn-harness/out/simpleView.json | \
  npm-cli/bin/rn-quick-render.js --output /tmp/simpleView.png
```

See [`npm-cli/README.md`](npm-cli/README.md) for the CLI's full flag
surface and troubleshooting.

## Writing a fixture

A fixture is a file whose default export is a React element. Two
styles:

**Real `react-native` components** — the harness boots the actual
`react-native` package under Node with a native-module shim, so your
component renders exactly as Fabric would mount it:

```tsx
import React from "react";
import { loadRealRn } from "../src/loadRealRn";

const { RN } = loadRealRn();
const { View, Text } = RN;

export default (
  <View style={{ padding: 16 }}>
    <Text style={{ fontSize: 20, fontWeight: "bold" }}>Hello</Text>
  </View>
);
```

**Host-element DSL** — lightweight, no RN module graph, useful for
renderer-focused fixtures:

```tsx
import React from "react";
import { RCTView, paragraph } from "./_dsl";

export default React.createElement(
  RCTView,
  { style: { padding: 16, backgroundColor: "#fff" } },
  paragraph("hello", { fontSize: 16 }),
);
```

Multi-frame fixtures export an array of elements (each frame renders
into the same surface, exercising the update path); Suspense/concurrent
fixtures export a `{ type: "concurrent", element, settle }` object. See
[`rn-harness/fixtures/`](rn-harness/fixtures/) for examples of every
shape.

Components that pull in heavy native-backed libraries (reanimated, svg,
gesture-handler, screens, async-storage, …) work out of the box: the
harness ships a curated mock pack that renders them as placeholder
views, and everything above your component — props, providers, data —
is yours to supply in the fixture, exactly like a Storybook story. The
full contract, including per-fixture native-module overrides and the
opt-in catch-all auto-mock, is in
[`docs/rendering-real-apps.md`](docs/rendering-real-apps.md).

## Rendering across devices, font scales, and themes

The renderer ships named device profiles (`smallPhone`, `pixel5`,
`pixel7Pro`, `tablet` — chosen to bracket the dp-width buckets RN
breakpoint hooks branch on) and font-scale buckets (`compact` 0.85×,
`default` 1.0×, `large` 1.3×, `a11y` 2.0×, `a11yMax` 3.1× — bracketing
iOS Dynamic Type and Android Font Size).

One-off:

```bash
cat out/myScreen.json | rn-quick-render --output out.png --fontScale 2.0
```

Fan a matrix out across one warm JVM with `--batch` (the expensive
`Bridge.init()` is paid once per device profile, not once per render —
roughly a 9× wall-clock win over separate invocations):

```json
{
  "fonts": "android/app/src/main/assets/fonts",
  "entries": [
    { "input": "out/myScreen.json", "output": "renders/myScreen_pixel5.png", "device": "pixel5" },
    { "input": "out/myScreen.json", "output": "renders/myScreen_tablet.png", "device": "tablet" },
    { "input": "out/myScreen__dark.json", "output": "renders/myScreen_pixel5_dark.png", "device": "pixel5" }
  ]
}
```

```bash
rn-quick-render --batch manifest.json
```

**Dark mode** is a capture-time concern, not a render flag: the harness's
`setColorScheme("dark")` overrides RN's `useColorScheme()` hook — the
same API real apps derive their theme from — and the capture is written
with a `__dark` suffix. The renderer just paints whatever colors landed
in the stream.

**Custom fonts**: pass `--fonts <dir>` (e.g. your app's
`android/app/src/main/assets/fonts/`) and every `.ttf`/`.otf` is
registered by filename; unknown families fall back to Roboto with a
logged warning.

## What renders faithfully (and what doesn't)

Supported today: view nesting and full flexbox layout (real Yoga),
nested text spans (size/weight/color/style per run), local images
(`data:`/`file://`, all `resizeMode`s, `tintColor`), ScrollView (resting
state), transforms, opacity, `boxShadow` (blur approximated on the
software canvas), custom fonts, multi-frame updates, and
Suspense-driven commits.

Known gaps, by design or pending:

- **RTL** — the Yoga root is currently hard-coded LTR.
- **Animations and gestures** render at their resting/initial state; a
  snapshot is a single frame.
- **HTTP image sources** are not fetched — pin assets locally.
- **Custom native views** (maps, charts, svg internals) render as
  placeholder rects unless you swap them out in your fixture.
- Rendering happens on layoutlib's software canvas: most pixels match a
  device exactly, but hardware-accelerated effects (platform elevation
  shadows, blurs) are approximated.

## Verifying and testing

Both stages are golden-tested:

```bash
npm --prefix rn-harness test                     # JSON capture goldens (Jest)
./gradlew :renderer:test                         # PNG render goldens (JUnit)
./gradlew :renderer:test -Drenderer.record=true  # re-record PNGs after intentional drift
```

Matrix goldens live under `renderer/src/test/snapshots/matrix/`. CI
re-runs both suites on every push and uploads fresh renders as
artifacts.

## Documentation

| Doc | What's in it |
| --- | --- |
| [`docs/architecture.md`](docs/architecture.md) | How the pipeline works: capture, the mount-instruction contract, Yoga + layoutlib rendering, and the key design decisions. |
| [`docs/rendering-real-apps.md`](docs/rendering-real-apps.md) | Rendering components from a real app: the mocking layers, asset/font pipelines, and what the harness expects you to bring. |
| [`docs/fabric-mount-instructions.md`](docs/fabric-mount-instructions.md) | Reference: every Fabric mount-instruction type the capture stub records. |
| [`docs/roadmap.md`](docs/roadmap.md) | What's next, across both engines. |
| [`docs/proposals/jest-capture.md`](docs/proposals/jest-capture.md) | Proposal: capture snapshots from inside an existing Jest test suite. |
| [`npm-cli/README.md`](npm-cli/README.md) | Android-engine CLI install, usage, troubleshooting. |
| [`npm-cli-ios/README.md`](npm-cli-ios/README.md) | iOS engine (simulator rendering over HTTP). |
