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

import { useMemo } from "react";
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
  "3xl": 32,
  "4xl": 40,
  "5xl": 64,
} as const;

const RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
  full: 999,
} as const;

// Atoms are utility-class-style flat style objects. Real alf has
// hundreds; this stub only ships the keys current fixtures import.
export const atoms = {
  // Sizing / layout
  w_full: { width: "100%" } as ViewStyle,
  flex_1: { flex: 1 } as ViewStyle,
  flex_row: { flexDirection: "row" } as ViewStyle,
  flex_wrap: { flexWrap: "wrap" } as ViewStyle,
  align_start: { alignItems: "flex-start" } as ViewStyle,
  align_center: { alignItems: "center" } as ViewStyle,
  justify_center: { justifyContent: "center" } as ViewStyle,
  mx_auto: { marginLeft: "auto", marginRight: "auto" } as ViewStyle,

  // Gap
  gap_sm: { gap: SPACING.sm } as ViewStyle,
  gap_md: { gap: SPACING.md } as ViewStyle,
  gap_2xl: { gap: SPACING["2xl"] } as ViewStyle,

  // Padding
  p_sm: { padding: SPACING.sm } as ViewStyle,
  p_md: { padding: SPACING.md } as ViewStyle,
  pr_md: { paddingRight: SPACING.md } as ViewStyle,
  pt_lg: { paddingTop: SPACING.lg } as ViewStyle,
  px_2xl: { paddingLeft: SPACING["2xl"], paddingRight: SPACING["2xl"] } as ViewStyle,

  // Margin
  mt_5xl: { marginTop: SPACING["5xl"] } as ViewStyle,

  // Border
  border: { borderWidth: 1 } as ViewStyle,
  border_t: { borderTopWidth: 1 } as ViewStyle,
  rounded_sm: { borderRadius: RADIUS.sm } as ViewStyle,
  rounded_full: { borderRadius: RADIUS.full } as ViewStyle,

  // Text
  text_xs: { fontSize: 12, letterSpacing: 0 } as TextStyle,
  text_sm: { fontSize: 14, letterSpacing: 0 } as TextStyle,
  // Real alf's `text_md` is the body default — 16pt.
  text_md: { fontSize: 16, letterSpacing: 0 } as TextStyle,
  // Real alf's `text_3xl` is ~26pt with a wider tracking. Hand-set.
  text_3xl: { fontSize: 26, letterSpacing: 0 } as TextStyle,
  font_bold: { fontWeight: "700" } as TextStyle,
  font_semi_bold: { fontWeight: "600" } as TextStyle,
  font_medium: { fontWeight: "500" } as TextStyle,
  text_center: { textAlign: "center" } as TextStyle,
  // Real alf computes lineHeight from fontSize × ratio; "snug" is
  // roughly 1.3. 14 × 1.3 ≈ 18.
  leading_snug: { lineHeight: 18 } as TextStyle,
  // "relaxed" is roughly 1.5×. 16 × 1.5 = 24 — sized for text_md
  // which is the Typography default. Other text sizes that combine
  // this atom get a slightly-off lineHeight as a known tradeoff of
  // the mock's per-atom hardcoding vs real alf's per-size compute.
  leading_relaxed: { lineHeight: 24 } as TextStyle,
};

// Themes carry style objects under `atoms.<name>` for components that
// pull theme-aware values via `t.atoms.<name>`, plus a `palette` map
// of raw color tokens. Values pulled from a hand-eyeballed light
// theme — close enough that tier fixtures read as the right component
// without requiring an exact palette match.
const STATIC_THEME = {
  // Real theme objects carry a `name` discriminant ('light' |
  // 'dark' | 'dim') that InterestButton branches on. Hardcode
  // 'light' here — the surface is always white in headless render.
  name: "light" as const,
  atoms: {
    bg: { backgroundColor: "#FFFFFF" } as ViewStyle,
    bg_contrast_50: { backgroundColor: "#F4F5F8" } as ViewStyle,
    bg_contrast_100: { backgroundColor: "#E7E9EE" } as ViewStyle,
    text: { color: "#0B0F19" } as TextStyle,
    text_inverted: { color: "#FFFFFF" } as TextStyle,
    text_contrast_medium: { color: "#42576C" } as TextStyle,
    border_contrast_low: { borderColor: "#D1D5DB" } as ViewStyle,
    border_contrast_high: { borderColor: "#79808E" } as ViewStyle,
  },
  palette: {
    // Primary (bsky blue) scale.
    primary_50: "#E6F3FF",
    primary_100: "#CCE7FF",
    primary_200: "#99CFFF",
    primary_500: "#0085FF",
    primary_600: "#0064D1",
    yellow: "#FFD400",
    // Negative (red) scale.
    negative_50: "#FCEBEB",
    negative_100: "#F9D5D5",
    negative_200: "#F3ABAB",
    negative_300: "#ED8181",
    negative_400: "#E64C4C",
    negative_500: "#E61D1D",
    negative_600: "#C71717",
    negative_700: "#9F1212",
    // Contrast scale — light theme. Used by InterestButton's
    // pill backgrounds (unselected = contrast_100 grey, selected
    // = contrast_900 near-black) and its text color
    // (contrast_900 unselected / contrast_100 selected), plus
    // the Button mock's secondary/inverted variants. Hand-set
    // to match how the bsky light theme reads at a glance; if a
    // future fixture needs exact parity these can be re-keyed to
    // the real palette.
    contrast_50: "#F4F5F8",
    contrast_100: "#E7E9EE",
    contrast_200: "#D1D5DD",
    contrast_300: "#B7BCC9",
    contrast_600: "#5C667A",
    contrast_800: "#1A2030",
    contrast_900: "#0B0F19",
    contrast_975: "#040610",
    // Solid neutrals — `white` shows up as the text color for
    // solid+primary buttons.
    white: "#FFFFFF",
  },
};

export function useTheme() {
  return STATIC_THEME;
}

// Real bsky `useBreakpoints()` reads window size and returns the
// active breakpoint flags plus `activeBreakpoint`. The capture
// surface defaults to a narrow phone-ish width (see renderFixture's
// surface), so all `gt*` flags are false and there's no active
// breakpoint above the default. Tier-2/3 fixtures only read these
// fields; extend if a future fixture needs `lessThanMobile` or
// similar.
export function useBreakpoints() {
  return {
    gtMobile: false,
    gtPhone: false,
    gtTablet: false,
    activeBreakpoint: undefined as
      | "gtPhone"
      | "gtMobile"
      | "gtTablet"
      | undefined,
  };
}

// useGutters mirrors real alf — returns padding values keyed by a
// 4-element [top, right, bottom, left] gutter spec (with 1- and
// 2-element shorthand expansion). Each entry is either `0` or a
// named gutter ('compact' | 'base' | 'wide'). FormContainer uses
// `[0, 'wide']` for vertical=0, horizontal=wide, which on the
// default breakpoint maps to `xl` (20).
type Gutter = "compact" | "base" | "wide" | 0;
const GUTTER_TABLE: Record<Exclude<Gutter, 0>, number> = {
  compact: SPACING.sm,
  base: SPACING.lg,
  wide: SPACING.xl,
};

export function useGutters(spec: Gutter[]) {
  let [top, right, bottom, left] = spec;
  if (right === undefined) {
    right = bottom = left = top;
  } else if (bottom === undefined) {
    bottom = top;
    left = right;
  }
  return useMemo(
    () => ({
      paddingTop: top === 0 ? 0 : GUTTER_TABLE[top],
      paddingRight: right === 0 ? 0 : GUTTER_TABLE[right],
      paddingBottom: bottom === 0 ? 0 : GUTTER_TABLE[bottom],
      paddingLeft: left === 0 ? 0 : GUTTER_TABLE[left],
    }),
    [top, right, bottom, left],
  );
}

// Platform helpers. Real alf exports `web`, `native`, `ios`,
// `android`, `platform`. They each return the passed style on the
// matching platform, undefined otherwise. The harness only targets
// the Android layoutlib path, so `web` returns undefined and
// `native`/`android` return the style as-is.
export function web<T>(_value: T): undefined {
  return undefined;
}
export function native<T>(value: T): T {
  return value;
}
export function android<T>(value: T): T {
  return value;
}
export function ios<T>(_value: T): undefined {
  return undefined;
}
export function platform<T>(specs: { web?: T; native?: T; android?: T; ios?: T }): T | undefined {
  // Mirror real alf's precedence: `android` > `native` > the rest.
  return specs.android ?? specs.native ?? undefined;
}

// alf exports a ViewStyleProp type used by many components for the
// `{style}` prop. Re-export a structurally compatible alias.
export type ViewStyleProp = { style?: ViewStyle | ViewStyle[] };
export type TextStyleProp = { style?: TextStyle | TextStyle[] };
