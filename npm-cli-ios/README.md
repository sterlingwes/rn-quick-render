# rn-quick-render-ios

iOS Fabric snapshot CLI. Captures a React Native component fixture to a Fabric
mount-instruction JSON stream (via `rn-harness`), then submits it to an
[`rn-ios-render-server`](https://github.com/sterlingwes/rn-ios-render-server)
instance over HTTP for rendering on a real iOS simulator.

> **Status:** pre-alpha. Sibling to [`npm-cli/`](../npm-cli) (the Android
> layoutlib renderer). Two packages, two render engines.

## How it fits

```
your-fixture.tsx ──► rn-quick-render-ios capture ──► fixture.json
                                                       │
                                                       ▼
                            POST /renders to rn-ios-render-server (HTTP)
                                                       │
                                                       ▼
                                    iOS simulator renders ──► PNG
```

The CLI's only connection to the backend is the HTTP API. No filesystem
coupling, no shared deploy artefacts.

## Install (from this checkout)

```bash
cd npm-cli-ios
npm install        # pulls rn-harness in via file:../rn-harness
```

## Configure the server

```bash
export RN_QUICK_RENDER_IOS_SERVER=http://127.0.0.1:8080
export RN_QUICK_RENDER_IOS_API_KEY=<your-key>
```

Or pass `--server` / `--api-key` to every command.

## Usage

### Capture (JSON only)

```bash
npm-cli-ios/bin/run capture examples/card.tsx --out card.json
```

### Render (JSON → PNG, server-side)

```bash
npm-cli-ios/bin/run render card.json \
  --device "iPhone 15 Pro" --rn-version 0.85.1 \
  --out card.png
```

### Snapshot (capture + render in one shot)

```bash
npm-cli-ios/bin/run snapshot examples/card.tsx --out card.png
# writes card.json alongside card.png
```

### Light vs dark capture

`--appearance` changes the React content (PlatformColor / useColorScheme),
not just the iOS chrome. Capture twice for a side-by-side:

```bash
npm-cli-ios/bin/run snapshot examples/card.tsx --appearance light --out light.png
npm-cli-ios/bin/run snapshot examples/card.tsx --appearance dark  --out dark.png
```

### Multi-device matrix

```bash
npm-cli-ios/bin/run matrix card.json --devices devices.json --out matrix/
```

### Pixel diff

```bash
npm-cli-ios/bin/run diff a.png b.png --threshold 0.001 --out diff.png
```

## Authoring fixtures

Fixtures are `.tsx` files whose default export is a React element (or array of
elements for multi-frame, or a function for concurrent).

Two import styles:

**Host-element DSL** — lightweight, no full RN runtime needed:

```tsx
import React from "react";
import { RCTView, paragraph } from "rn-quick-render-ios/dsl";

export default React.createElement(
  RCTView,
  { style: { padding: 16, backgroundColor: "#fff" } },
  paragraph("hello", { fontSize: 16 }),
);
```

**Real react-native components** — pulls in the full RN module graph under
Node (slower bootstrap, ~30s cold start):

```tsx
import React from "react";
import { View, Text } from "react-native";

export default React.createElement(View, null, React.createElement(Text, null, "hi"));
```

See [`examples/`](./examples/) for both patterns.

> **In-repo note:** the examples here use `"../src/dsl"` instead of
> `"rn-quick-render-ios/dsl"` for dev-checkout convenience (no `npm link`
> needed). End-user fixtures should use the package path.

## Carry-forward notes

- The DSL in `src/dsl.ts` is a copy of `rn-harness/fixtures/_dsl.ts`. Keep
  aligned when the harness DSL changes.
- Server payload flattens multi-frame / concurrent captures to a single
  `instructions` array. Multi-frame surfacing is a known gap.
- Publish-time packaging is TBD — `rn-harness` is a `file:` dep, which won't
  resolve for end users post-publish. Either publish rn-harness or bundle it
  into `dist/` before shipping to npm.
