# rn-quick-render-jest

Capture [rn-quick-render](../README.md) screen snapshots from inside
your app's existing Jest suite. Wherever a component already renders in
a test — with your mocks, your providers, your Jest preset — the same
element can be captured as a renderable artifact and turned into a PNG
across a device / font-scale / theme matrix by a separate render step.

> **Status:** pre-alpha, validated against react-native 0.85 with
> `@react-native/jest-preset`. Design + spike evidence:
> [`docs/proposals/jest-capture.md`](../docs/proposals/jest-capture.md),
> [`spikes/jest-capture/FINDINGS.md`](../spikes/jest-capture/FINDINGS.md).

## Usage

No Jest config changes needed for a stock
`preset: "@react-native/jest-preset"` app:

```tsx
import { render } from "@testing-library/react-native";
import { screenSnapshot } from "rn-quick-render-jest";

test("inbox renders", () => {
  render(<InboxScreen {...props} />);   // your existing assertions

  screenSnapshot(<InboxScreen {...props} />, {
    name: "inboxScreen",
    devices: ["pixel5", "tablet"],
    fontScales: ["default", "a11y"],
    colorSchemes: ["light", "dark"],
  });
});
```

Every `jest.mock` in scope applies to the capture — the element is
re-rendered through Fabric in the same module environment as your
test's render.

The test run writes to `__screensnaps__/` (override with `outDir` or
`$RN_QUICK_RENDER_SNAPS_DIR`):

- `<name>.json` / `<name>__dark.json` — mount-instruction artifacts,
  directly consumable by the JVM renderer
- `manifest-w<N>.jsonl` — one line per capture (name, input, test
  path, requested devices/font scales), one file per Jest worker

## Rendering and diffing

Rendering is a separate step, so CI can filter what actually renders:

```bash
# render every captured snapshot and diff against goldens
rn-quick-render verify __screensnaps__ --goldens snaps-goldens

# only snapshots whose name matches, e.g. for a changed component
rn-quick-render verify __screensnaps__ --goldens snaps-goldens --filter inbox

# bless current renders as the new goldens
rn-quick-render verify __screensnaps__ --goldens snaps-goldens --record
```

See [`npm-cli/README.md`](../npm-cli/README.md) for renderer install
and requirements (JDK 17+).

## When you do need setup

If your app's own code touches RN's DOM APIs before the first
`screenSnapshot` call, install the environment shims eagerly:

```js
// jest.config.js
module.exports = {
  preset: "@react-native/jest-preset",
  setupFiles: ["rn-quick-render-jest/setup"],
};
```

## Known limitations

- **Single-frame captures**: multi-frame / Suspense capture (supported
  by the harness) isn't exposed through `screenSnapshot` yet.
- **RN version range**: 0.83 / 0.84 / 0.85 are exercised by the
  version-matrix CI job; the NativeDOM shim self-skips on versions
  without the module. Outside that range you're in untested territory.
- Wholesale `jest.mock("react-native")` produces hollow streams; the
  capture fails loudly rather than snapshotting a blank image.

## Development (this repo)

```bash
cd npm-jest && npm install && npm run build   # bundles src + harness capture core to dist/
cd ../spikes/jest-capture && npm install && npx jest   # consumer-shaped test bed
```

`dist/` is committed so the consumer test bed installs without a build
step; CI rebuilds and fails on drift.
