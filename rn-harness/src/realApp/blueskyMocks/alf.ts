// Minimal stand-in for bluesky-social-app's `#/alf` design-system
// module. The real alf is a few thousand lines of style atoms, theme
// hooks, breakpoints, and platform helpers — way more surface than
// any single tier fixture exercises. Mocking it lets us render
// individual bsky components without pulling in @bsky.app/alf (a
// private package) or its dependency chain.
//
// Add fields to the exported `atoms` and `STATIC_THEME` as new
// fixtures need them. Keep the values closely matching what real
// alf produces for that key — the point is a faithful first
// impression of the component, not a thorough design-system
// re-implementation.

import type { TextStyle, ViewStyle } from "react-native";

// Spacing tokens roughly aligned with @bsky.app/alf's t-shirt scale.
// Hand-tuned values — the upstream package isn't published so we
// can't import them; if anything in this file looks off in a rendered
// snapshot, this table is where to start.
const SPACING = {
  "2xs": 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
} as const;

const RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
} as const;

// Atoms are utility-class-style flat style objects. Real alf has
// hundreds; this stub only ships the keys current fixtures import.
export const atoms = {
  // Sizing / layout
  w_full: { width: "100%" } as ViewStyle,
  flex_1: { flex: 1 } as ViewStyle,
  flex_row: { flexDirection: "row" } as ViewStyle,
  align_start: { alignItems: "flex-start" } as ViewStyle,
  justify_center: { justifyContent: "center" } as ViewStyle,

  // Gap
  gap_sm: { gap: SPACING.sm } as ViewStyle,

  // Padding
  p_sm: { padding: SPACING.sm } as ViewStyle,
  p_md: { padding: SPACING.md } as ViewStyle,
  pr_md: { paddingRight: SPACING.md } as ViewStyle,

  // Border
  border: { borderWidth: 1 } as ViewStyle,
  border_t: { borderTopWidth: 1 } as ViewStyle,
  rounded_sm: { borderRadius: RADIUS.sm } as ViewStyle,

  // Text
  text_sm: { fontSize: 14, letterSpacing: 0 } as TextStyle,
  // Real alf computes lineHeight from fontSize × ratio; "snug" is
  // roughly 1.3. 14 × 1.3 ≈ 18.
  leading_snug: { lineHeight: 18 } as TextStyle,
};

// Themes carry style objects under `atoms.<name>` for components that
// pull theme-aware values via `t.atoms.<name>`, plus a `palette` map
// of raw color tokens. Values pulled from a hand-eyeballed light
// theme — close enough that tier fixtures read as the right component
// without requiring an exact palette match.
const STATIC_THEME = {
  atoms: {
    bg: { backgroundColor: "#FFFFFF" } as ViewStyle,
    text: { color: "#0B0F19" } as TextStyle,
    text_contrast_medium: { color: "#42576C" } as TextStyle,
    border_contrast_low: { borderColor: "#D1D5DB" } as ViewStyle,
    border_contrast_high: { borderColor: "#79808E" } as ViewStyle,
  },
  palette: {
    primary_500: "#0085FF",
    yellow: "#FFD400",
    negative_500: "#E61D1D",
  },
};

export function useTheme() {
  return STATIC_THEME;
}

// Real bsky `useBreakpoints()` reads window size and returns the
// active breakpoint flags. The capture surface defaults to a narrow
// phone-ish width (see renderFixture's surface), so `gtMobile` is
// false. Admonition reads only this field; extend if a fixture needs
// gtPhone / gtTablet.
export function useBreakpoints() {
  return { gtMobile: false, gtPhone: false, gtTablet: false };
}

// alf exports a ViewStyleProp type used by many components for the
// `{style}` prop. Re-export a structurally compatible alias.
export type ViewStyleProp = { style?: ViewStyle | ViewStyle[] };
