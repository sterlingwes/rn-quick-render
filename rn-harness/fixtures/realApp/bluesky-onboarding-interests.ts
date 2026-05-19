import React from "react";
import { loadRealRn } from "../../src/loadRealRn";

// Tier-4 real-app fixture — Phase 3 "screen-sized" coverage.
//
// Tier 1-3 (Divider / Admonition / PasswordUpdatedForm) walked
// from primitive → composite card → small form. Tier 4 jumps to a
// full Onboarding step (`StepInterests`, ~100 lines) that produces
// a realistic phone-sized layout: step indicator, headline,
// description paragraph, wrapping grid of ~24 interest pills, and
// a Continue button. It's the first fixture where the rendered
// PNG can stand next to a screenshot of the actual bsky onboarding
// flow for a visual diff.
//
// What this exercises beyond tier 3:
//   - A real form-context component (`Toggle.Group` + `Toggle.Item`
//     publishing per-item context that `InterestButton` reads via
//     `Toggle.useItemContext()`). Selected vs unselected pill
//     branching depends on that context.
//   - A `flex_row` + `flex_wrap` grid laying out 24 children
//     across multiple rows — first fixture testing Yoga's wrap
//     behaviour through a real component.
//   - Theme palette access for `contrast_100` / `contrast_900`
//     pill backgrounds and per-pill text colour switching, plus
//     the `t.name === 'light'` discriminator branch in
//     `InterestButton`.
//   - `OnboardingControls.Portal` mocked as a pass-through so the
//     Continue button renders inline below the grid rather than
//     into an unmounted portal outlet — a deliberate departure
//     from how the real app slots it into the screen's footer.
//
// What the captured tree should contain:
//   - AppContainer-prod flex:1 wrap
//   - The harness's phone-sized container (white bg, padding for
//     status bar + nav header)
//   - A View with align_start + gap_sm holding the step row,
//     headline, description, toggle-group wrapper, and Continue
//     button portal-passthrough
//   - 24 `InterestButton` pill Views nested under `Toggle.Item`s;
//     the four pre-selected ones (`art`, `tech`, `music`,
//     `photography` — see `blueskyMocks/onboardingState.tsx`)
//     have dark `contrast_900` backgrounds, the rest the light
//     `contrast_100` grey
//
// What the PNG should show: a Pixel-5-sized white screen with a
// "Step 2 of 4" caption, a 26pt bold "What are your interests?"
// heading, a body paragraph, a wrapping grid of pills with four
// dark + twenty light variants, and a "Continue" label below
// (unstyled — the mock Button doesn't paint the real solid
// primary background).

const { RN } = loadRealRn();
const { View, AppRegistry } = RN;

const { StepInterests } =
  require("../../../third_party/bluesky-social-app/src/screens/Onboarding/StepInterests") as {
    StepInterests: React.ComponentType;
  };

// Read the bg from the alf mock so the wrapper picks up whatever
// theme `useColorScheme()` resolved to (light by default, dark when
// the harness has called `setColorScheme('dark')` before render).
// Previously this was hard-coded white, which left every dark-mode
// capture rendering the page background as light even though the
// pill / text palette had flipped.
const { useTheme } = require("../../src/realApp/blueskyMocks/alf") as {
  useTheme: () => { atoms: { bg: { backgroundColor: string } } };
};

function BlueskyOnboardingInterestsHarness() {
  const t = useTheme();
  return React.createElement(
    View,
    {
      style: {
        // Phone-screen surface — the capture canvas is already
        // 393×851 dp (Pixel 5 at 440dpi), so we just need to
        // fill it.
        flex: 1,
        backgroundColor: t.atoms.bg.backgroundColor,
        // Pad in from the edges to mimic the safe-area + nav
        // header chrome the real Layout component would draw.
        // Side padding is gentler than the screen-edge padding
        // the real ScrollView uses so the wrapping grid actually
        // gets to wrap rather than stack one-per-row.
        paddingTop: 56,
        paddingHorizontal: 20,
        paddingBottom: 40,
      },
    },
    React.createElement(StepInterests),
  );
}

AppRegistry.registerComponent(
  "BlueskyOnboardingInterests",
  () => BlueskyOnboardingInterestsHarness,
);

const { captureFromAppKey } =
  require("../../src/captureFromAppKey") as typeof import("../../src/captureFromAppKey");

export default captureFromAppKey("BlueskyOnboardingInterests");
