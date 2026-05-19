// Stand-in for bluesky-social-app's
// `#/screens/Onboarding/Layout` module.
//
// The real `Layout` component is ~210 lines: a fixed-position
// dialog overlay with a ScrollView body, header slot, footer slot,
// safe-area insets via `react-native-safe-area-context`, breakpoint
// switching, and a Portal pair (`OnboardingControls`,
// `OnboardingHeaderSlot`) that lets the active step inject its
// Continue button + per-step header chrome into those slots.
//
// `StepInterests` only imports the four named exports we re-create
// below, so we skip mounting the parent Layout entirely. The fixture
// supplies its own phone-sized wrapper, and we replace the
// `OnboardingControls.Portal` with a plain inline View so the
// Continue button renders below the interest grid (instead of
// disappearing into an unmounted portal outlet).
//
// `OnboardingTitleText` and `OnboardingDescriptionText` are
// pulled in verbatim from the real Layout — they're small enough
// to inline, and they exercise our extended ALF atom set
// (`text_3xl` / `font_bold` / `text_md` / `leading_snug` +
// `text_contrast_medium`) end-to-end.

import * as React from "react";
import { View, type TextStyle, type ViewStyle } from "react-native";

import { atoms as a, useTheme, type TextStyleProp } from "./alf";
import { Text } from "./typography";

export function OnboardingPosition() {
  // Skip importing `useOnboardingInternalState` from the state
  // mock just for this — hardcoded "Step 2 of 4" matches the
  // mocked state and avoids any cross-module coupling.
  const t = useTheme();
  return (
    <Text style={[a.text_sm, a.font_medium, t.atoms.text_contrast_medium]}>
      Step 2 of 4
    </Text>
  );
}

export function OnboardingTitleText({
  children,
  style,
}: React.PropsWithChildren<TextStyleProp>) {
  return (
    <Text style={[a.text_3xl, a.font_bold, a.leading_snug, style as TextStyle]}>
      {children}
    </Text>
  );
}

export function OnboardingDescriptionText({
  children,
  style,
}: React.PropsWithChildren<TextStyleProp>) {
  const t = useTheme();
  return (
    <Text style={[a.text_md, a.leading_snug, t.atoms.text_contrast_medium, style as TextStyle]}>
      {children}
    </Text>
  );
}

// Real `OnboardingControls` is `createPortalGroup()` — a
// `<Portal>/<Outlet>` pair. We collapse `.Portal` into a plain
// View so children render inline; `.Outlet` becomes a no-op since
// nothing in our snapshot world will consume the portal stream.
export const OnboardingControls = {
  Portal: function PortalPassthrough({
    children,
    style,
  }: React.PropsWithChildren<{ style?: ViewStyle }>) {
    return <View style={style}>{children}</View>;
  },
  Outlet: function OutletNoop() {
    return null;
  },
};

export const OnboardingHeaderSlot = {
  Portal: function PortalPassthrough({ children }: React.PropsWithChildren) {
    return <>{children}</>;
  },
  Outlet: function OutletNoop() {
    return null;
  },
};
