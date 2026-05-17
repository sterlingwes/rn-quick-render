import React from "react";
import { loadRealRn } from "../../src/loadRealRn";

// First "real-app component" fixture — Phase 3 step #4, tier 1.
//
// Imports `Divider` directly from the bluesky-social-app submodule
// (`third_party/bluesky-social-app/src/components/Divider.tsx`),
// wraps it in a sized container, and exports the resulting tree
// for capture. The Divider's only design-system dependency is
// `#/alf`, which our resolver redirects to `src/realApp/blueskyMocks/alf.ts`
// (see `src/realAppResolver.ts`) — so this fixture exercises just
// the resolver + babel-transform plumbing for the submodule, with
// the smallest possible piece of real-app source.
//
// What the captured tree should contain:
//   - the AppContainer-prod flex:1 outer wrap (we go through
//     captureFromAppKey to mirror what a real device mounts)
//   - a sized RCTView with light-gray background
//     (the wrapper container the harness owns)
//   - bluesky's Divider — an RCTView with top-border styling
//
// What the PNG should show: a single 1dp horizontal line in
// `#D1D5DB` (alf stub's `border_contrast_low`) across the width of
// the wrapper container.

const { RN } = loadRealRn();
const { View, AppRegistry } = RN;

// require *after* loadRealRn so the resolver hooks are installed
// before bsky source loads.
const { Divider } =
  require("../../../third_party/bluesky-social-app/src/components/Divider") as {
    Divider: React.ComponentType<{ style?: object }>;
  };

function BlueskyDividerHarness() {
  return React.createElement(
    View,
    {
      style: {
        padding: 24,
        backgroundColor: "#F8F8FA",
      },
    },
    React.createElement(Divider, null),
  );
}

AppRegistry.registerComponent("BlueskyDivider", () => BlueskyDividerHarness);

const { captureFromAppKey } =
  require("../../src/captureFromAppKey") as typeof import("../../src/captureFromAppKey");

export default captureFromAppKey("BlueskyDivider");
