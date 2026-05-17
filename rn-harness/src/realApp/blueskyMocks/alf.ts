// Minimal stand-in for bluesky-social-app's `#/alf` design-system
// module. The real alf is a few thousand lines of style atoms, theme
// hooks, breakpoints, and platform helpers — way more surface than
// any single tier-1 fixture exercises. Mocking it lets us render
// individual bsky components without pulling in @bsky.app/alf (a
// private package) or its dependency chain.
//
// Add fields to the exported `atoms` and `STATIC_THEME` as new
// fixtures need them. Keep the values closely matching what real
// alf produces for that key — the point is a faithful first
// impression of the component, not a thorough design-system
// re-implementation.

import type { ViewStyle } from "react-native";

// Atoms are utility-class-style flat style objects. Real alf has
// hundreds; this stub only ships the keys current fixtures import.
export const atoms = {
  w_full: { width: "100%" } as ViewStyle,
  border_t: { borderTopWidth: 1 } as ViewStyle,
};

// Themes carry style objects under `atoms.<name>` for components that
// pull theme-aware values via `t.atoms.<name>`. The light theme's
// `border_contrast_low` is a pale gray in real bsky.
const STATIC_THEME = {
  atoms: {
    border_contrast_low: { borderColor: "#D1D5DB" } as ViewStyle,
  },
};

export function useTheme() {
  return STATIC_THEME;
}

// alf exports a ViewStyleProp type used by many components for the
// `{style}` prop. Re-export a structurally compatible alias.
export type ViewStyleProp = { style?: ViewStyle | ViewStyle[] };
