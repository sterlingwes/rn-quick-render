import React from "react";
import { loadRealRn } from "../../src/loadRealRn";

// Tier-2 real-app fixture — Phase 3 step #4, tier 2.
//
// Where tier 1 (`bluesky-divider`) renders a single 11-line visual
// primitive whose only `#/alf` dependency is two flat atoms, tier 2
// targets `Admonition` (150 lines, src/components/Admonition.tsx in
// bluesky-social-app): a composite "info card" — Icon + Content +
// Text laid out in a Row inside an Outer with theme-aware border /
// background / padding.
//
// What that exercises beyond tier 1:
//   - `useBreakpoints()` (a runtime hook, not a flat atom)
//   - A wider slice of `useTheme()` (palette + atoms.bg +
//     border_contrast_high)
//   - A multi-style array merge per <View> with theme + atoms +
//     inline-object branches
//   - A mocked `#/components/Typography` Text component, distinct
//     from `react-native`'s Text but with the same rendered shape
//   - Placeholder icon modules — every icon import compiles to a
//     coloured-square <View> via blueskyMocks/icons.tsx (real bsky
//     renders these as react-native-svg paths; the renderer doesn't
//     yet have an SVG host)
//
// What the captured tree should contain (default `type='info'`):
//   - AppContainer-prod's flex:1 outer wrap (captureFromAppKey path)
//   - The harness's padded container View
//   - Admonition.Outer's bordered card View
//   - Admonition.Row's flex-row wrapper View
//   - The icon placeholder (CircleInfo) — a small filled square View
//   - Admonition.Content's column wrapper View
//   - Admonition.Text wrapping the literal text via RNText
//
// What the PNG should show: a rounded-corner light card with a
// 1dp gray border, an icon-coloured square on the left, and a line
// of body text to its right. Tier-3 will graduate to a screen-shaped
// fixture that includes Admonition as one of several stacked pieces.

const { RN } = loadRealRn();
const { View, AppRegistry } = RN;

// require *after* loadRealRn so the resolver hooks are installed
// before bsky source loads.
const { Admonition } =
  require("../../../third_party/bluesky-social-app/src/components/Admonition") as {
    Admonition: React.ComponentType<{
      children: React.ReactNode;
      type?: "info" | "tip" | "warning" | "error" | "apology";
      style?: object;
    }>;
  };

function BlueskyAdmonitionHarness() {
  return React.createElement(
    View,
    {
      style: {
        padding: 24,
        backgroundColor: "#F8F8FA",
      },
    },
    React.createElement(
      Admonition,
      null,
      "Heads up — this is an informational admonition rendered from " +
        "unmodified bsky source.",
    ),
  );
}

AppRegistry.registerComponent(
  "BlueskyAdmonition",
  () => BlueskyAdmonitionHarness,
);

const { captureFromAppKey } =
  require("../../src/captureFromAppKey") as typeof import("../../src/captureFromAppKey");

export default captureFromAppKey("BlueskyAdmonition");
