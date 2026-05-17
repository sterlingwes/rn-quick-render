import React from "react";
import { loadRealRn } from "../../src/loadRealRn";

// Tier-3 real-app fixture — Phase 3 step #4, tier 3.
//
// First fixture pulling in actual bluesky-social-app *screen* source
// (under `src/screens/`). Tier 1 (Divider) was a single primitive,
// tier 2 (Admonition) was a card-shaped composite; tier 3 graduates
// to a screen-shaped fixture: `PasswordUpdatedForm`, a 43-line
// success page from the login flow.
//
// What this exercises beyond tier 2:
//   - A transitive submodule import: PasswordUpdatedForm.tsx imports
//     `./FormContainer` (also bsky source), which itself imports
//     `#/alf` + `#/components/Typography`. The resolver has to
//     handle the relative path inside the submodule without our
//     intervention, then mock both alf and Typography on its
//     subsequent imports.
//   - The lingui i18n stack — `msg`, `useLingui`, `<Trans>` — all
//     resolved to runtime mocks under `linguiCoreMacro.ts` /
//     `linguiReact.tsx` / `linguiReactMacro.tsx` so the bsky code's
//     untransformed macro calls don't crash.
//   - `useGutters([0, 'wide'])` in FormContainer, returning the
//     `xl` (20dp) horizontal padding our alf mock now wires up.
//   - `web([a.flex_row, a.justify_center])` resolving to `undefined`
//     on the native code path — captured tree should show the
//     Button stack without web-only centering.
//   - `Button` + `ButtonText` from our extended button mock,
//     wrapping the `<Trans>Okay</Trans>` Text.
//
// What the captured tree should contain:
//   - AppContainer-prod flex:1 wrap (captureFromAppKey path)
//   - The harness's padded container View
//   - FormContainer's outer View (gap:12, flex:1 + horizontal
//     gutter from useGutters)
//   - PasswordUpdatedForm's two title Text rows ("Password
//     updated!", "You can now sign in with your new password.")
//   - The button-wrapper View (no web style → no styling object)
//   - The Button → View, with the ButtonText → "Okay" Text inside
//
// What the PNG should show: a left-aligned column on a light
// background with a large bold "Password updated!" heading, a body
// paragraph, and a labelled button — the rough shape of a real
// post-flow success screen, rendered from unmodified bsky source
// through ~6 hand-written mocks.

const { RN } = loadRealRn();
const { View, AppRegistry } = RN;

// require *after* loadRealRn so the resolver hooks are installed
// before bsky source loads.
const { PasswordUpdatedForm } =
  require("../../../third_party/bluesky-social-app/src/screens/Login/PasswordUpdatedForm") as {
    PasswordUpdatedForm: React.ComponentType<{ onPressNext: () => void }>;
  };

function BlueskyPasswordUpdatedHarness() {
  return React.createElement(
    View,
    {
      style: {
        // Tier-3 fixture's "page" surface — the harness's stand-in
        // for whatever screen background the real app would mount
        // PasswordUpdatedForm onto. Light, padded, fixed-width-ish.
        padding: 24,
        backgroundColor: "#F8F8FA",
        // Give FormContainer's `flex:1` a finite container to
        // expand into. The capture surface itself is also bounded
        // but having an explicit minHeight keeps the rendered card
        // proportions stable across surface-size changes.
        minHeight: 480,
      },
    },
    React.createElement(PasswordUpdatedForm, {
      onPressNext: () => {
        /* no-op: snapshot is the resting state */
      },
    }),
  );
}

AppRegistry.registerComponent(
  "BlueskyPasswordUpdated",
  () => BlueskyPasswordUpdatedHarness,
);

const { captureFromAppKey } =
  require("../../src/captureFromAppKey") as typeof import("../../src/captureFromAppKey");

export default captureFromAppKey("BlueskyPasswordUpdated");
