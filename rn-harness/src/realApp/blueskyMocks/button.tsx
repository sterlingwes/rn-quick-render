// Stand-in for bluesky-social-app's `#/components/Button` module.
//
// The real Button file is ~900 lines: a Pressable backbone, hover /
// focus / press state tracking, deprecated variant fallbacks, a
// Link extension, ButtonHitslop, and a substantial variant × color
// × size × shape style matrix that decides backgrounds, borders,
// padding, radii, gaps, text colors, and text sizes. None of the
// interaction-state machinery is reachable in a headless snapshot,
// but the rest of the matrix is exactly what makes a rendered
// Button look like a real button — the previous mock was a bare
// View pass-through, which is why tier-3's "Okay" and tier-4's
// "Continue" used to render as floating unstyled text instead of
// pill-shaped solid-blue affordances.
//
// This mock replicates the resting-state slice of that matrix:
//   - Container: `flex_row` + `align_center` + `justify_center`,
//     plus padding/radius/gap from the shape × size table starting
//     at `Button.tsx:454`.
//   - Variant + color: only the solid path is implemented end-to-end
//     (the deprecated outline / ghost variants get a minimal
//     border / no-fill treatment). Solid covers all six color
//     tokens the tier fixtures might reach for: primary, secondary,
//     secondary_inverted, negative, primary_subtle, negative_subtle.
//   - Text styling: `ButtonText` reads the variant + color + size +
//     disabled state from `ButtonContext` and applies the matching
//     text color + size atoms from `Button.tsx:594` (the
//     `useSharedButtonTextStyles` hook).
//   - `ButtonIcon` is a stub View so the import resolves; the
//     fixture only renders it conditionally (Loader on saving=true)
//     and the snapshot is the resting state.
//
// Anything still missing — focus/hover/press visuals, the curve
// `borderCurve: 'continuous'` (no Yoga representation), proper
// gap-between-icon-and-text spacing on web — is documented in the
// real Button.tsx as platform-conditional and doesn't change the
// resting render.

import * as React from "react";
import {
  Text as RNText,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { atoms as a, useTheme } from "./alf";

export type ButtonSize = "tiny" | "small" | "large";
export type ButtonShape = "default" | "round" | "square" | "rectangular";
export type ButtonVariant = "solid" | "outline" | "ghost";
export type ButtonColor =
  | "primary"
  | "secondary"
  | "secondary_inverted"
  | "negative"
  | "primary_subtle"
  | "negative_subtle";

export type ButtonProps = {
  children?: React.ReactNode;
  label?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  color?: ButtonColor;
  shape?: ButtonShape;
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  [key: string]: unknown;
};

// Mirror real Button's ButtonContext shape closely enough that
// ButtonText / ButtonIcon can branch on it the same way the real
// `useSharedButtonTextStyles` does.
type ButtonCtx = {
  size: ButtonSize;
  variant: ButtonVariant;
  color: ButtonColor;
  shape: ButtonShape;
  disabled: boolean;
};
const ButtonContext = React.createContext<ButtonCtx>({
  size: "small",
  variant: "solid",
  color: "primary",
  shape: "default",
  disabled: false,
});

export function useButtonContext(): ButtonCtx {
  return React.useContext(ButtonContext);
}

export function Button({
  children,
  style,
  size = "small",
  variant = "solid",
  color = "primary",
  shape = "default",
  disabled = false,
}: ButtonProps) {
  const t = useTheme();

  const containerStyles: ViewStyle[] = [
    a.flex_row,
    a.align_center,
    a.justify_center,
  ];
  containerStyles.push(...resolveContainerVariant(variant, color, disabled, t));
  containerStyles.push(...resolveContainerShapeSize(shape, size));

  const ctx = React.useMemo<ButtonCtx>(
    () => ({ size, variant, color, shape, disabled }),
    [size, variant, color, shape, disabled],
  );

  return (
    <ButtonContext.Provider value={ctx}>
      <View style={[...containerStyles, style as ViewStyle]}>{children}</View>
    </ButtonContext.Provider>
  );
}

export type ButtonTextProps = {
  children?: React.ReactNode;
  style?: StyleProp<TextStyle>;
  [key: string]: unknown;
};

export function ButtonText({ children, style }: ButtonTextProps) {
  const t = useTheme();
  const { size, variant, color, disabled } = useButtonContext();

  const textStyles: TextStyle[] = [];
  textStyles.push(...resolveTextColor(variant, color, disabled, t));
  textStyles.push(...resolveTextSize(size));
  // RN doesn't `textAlign: center` by default; for a button label
  // sitting inside a `justify_center` row this lines the label up
  // when the Button has explicit width.
  textStyles.push({ textAlign: "center" });

  return <RNText style={[...textStyles, style as TextStyle]}>{children}</RNText>;
}

export type ButtonIconProps = {
  icon?: React.ComponentType<unknown>;
  size?: string;
  [key: string]: unknown;
};

// Real ButtonIcon picks a pixel size from the parent Button's size
// (Button.tsx:783). We size the placeholder square to roughly match
// (large=20, small=16, tiny=12) so an icon-bearing fixture lays
// out close to the real thing. The icon component itself, when
// supplied, is rendered inside the box.
export function ButtonIcon({ icon: IconComponent, size: iconSize }: ButtonIconProps) {
  const { size: buttonSize } = useButtonContext();
  const fallback = buttonSize === "large" ? 20 : buttonSize === "small" ? 16 : 12;
  const box = parseIconSize(iconSize) ?? fallback;
  return (
    <View
      style={{
        width: box,
        height: box,
        alignItems: "center",
        justifyContent: "center",
      }}>
      {IconComponent ? React.createElement(IconComponent as React.ComponentType<unknown>) : null}
    </View>
  );
}

function parseIconSize(spec?: string): number | null {
  // Mirror the few size tokens real ButtonIcon accepts via the
  // SVGIconProps['size'] union: 2xs/xs/sm/md/lg/xl. Approximate
  // pixel values from real ALF's icon-size table.
  switch (spec) {
    case "2xs":
      return 10;
    case "xs":
      return 12;
    case "sm":
      return 14;
    case "md":
      return 18;
    case "lg":
      return 20;
    case "xl":
      return 24;
    default:
      return null;
  }
}

function resolveContainerVariant(
  variant: ButtonVariant,
  color: ButtonColor,
  disabled: boolean,
  t: ReturnType<typeof useTheme>,
): ViewStyle[] {
  if (variant === "solid") {
    switch (color) {
      case "primary":
        return [{ backgroundColor: disabled ? t.palette.primary_200 : t.palette.primary_500 }];
      case "secondary":
        return [t.atoms.bg_contrast_50];
      case "secondary_inverted":
        return [{ backgroundColor: disabled ? t.palette.contrast_600 : t.palette.contrast_900 }];
      case "negative":
        return [{ backgroundColor: disabled ? t.palette.negative_700 : t.palette.negative_500 }];
      case "primary_subtle":
        return [{ backgroundColor: t.palette.primary_50 }];
      case "negative_subtle":
        return [{ backgroundColor: t.palette.negative_50 }];
    }
  }
  if (variant === "outline") {
    // Outline = white-ish bg + 1px colored border. Matches
    // Button.tsx:323 deprecated-styles path well enough for a
    // resting-state snapshot.
    const borderColor = (() => {
      switch (color) {
        case "primary":
          return disabled ? t.palette.primary_200 : t.palette.primary_500;
        case "secondary":
        case "secondary_inverted":
          return disabled ? t.palette.contrast_200 : t.palette.contrast_300;
        case "negative":
        case "negative_subtle":
          return disabled ? t.palette.negative_200 : t.palette.negative_500;
        case "primary_subtle":
          return t.palette.primary_500;
      }
    })();
    return [t.atoms.bg, { borderWidth: 1, borderColor }];
  }
  // ghost: no fill, no border. The text color carries it.
  return [];
}

function resolveContainerShapeSize(shape: ButtonShape, size: ButtonSize): ViewStyle[] {
  if (shape === "default") {
    if (size === "large") return [a.rounded_full, { paddingVertical: 12, paddingHorizontal: 24, gap: 6 }];
    if (size === "small") return [a.rounded_full, { paddingVertical: 8, paddingHorizontal: 14, gap: 5 }];
    return [a.rounded_full, { paddingVertical: 5, paddingHorizontal: 10, gap: 3 }];
  }
  if (shape === "rectangular") {
    if (size === "large") return [{ paddingVertical: 12, paddingHorizontal: 25, borderRadius: 10, gap: 3 }];
    if (size === "small") return [{ paddingVertical: 8, paddingHorizontal: 13, borderRadius: 8, gap: 3 }];
    return [{ paddingVertical: 5, paddingHorizontal: 9, borderRadius: 6, gap: 2 }];
  }
  // round / square — fixed-dimension chrome (Button.tsx:497).
  const sizeBox = size === "large" ? 44 : size === "small" ? 33 : 25;
  const radius: ViewStyle =
    shape === "round" ? a.rounded_full : { borderRadius: size === "tiny" ? 6 : 8 };
  return [{ height: sizeBox, width: sizeBox }, radius];
}

function resolveTextColor(
  variant: ButtonVariant,
  color: ButtonColor,
  disabled: boolean,
  t: ReturnType<typeof useTheme>,
): TextStyle[] {
  if (variant === "solid") {
    switch (color) {
      case "primary":
      case "negative":
        return [{ color: t.palette.white }];
      case "secondary":
        return disabled ? [{ color: t.palette.contrast_300 }] : [t.atoms.text_contrast_medium];
      case "secondary_inverted":
        return disabled ? [{ color: t.palette.contrast_300 }] : [t.atoms.text_inverted];
      case "primary_subtle":
        return [{ color: disabled ? t.palette.primary_200 : t.palette.primary_600 }];
      case "negative_subtle":
        return [{ color: disabled ? t.palette.negative_200 : t.palette.negative_600 }];
    }
  }
  // outline / ghost share a per-color text token in the real file.
  switch (color) {
    case "primary":
    case "primary_subtle":
      return [{ color: t.palette.primary_600 }];
    case "secondary":
    case "secondary_inverted":
      return [{ color: t.palette.contrast_600 }];
    case "negative":
    case "negative_subtle":
      return [{ color: t.palette.negative_400 }];
  }
}

function resolveTextSize(size: ButtonSize): TextStyle[] {
  if (size === "large") return [a.text_md, a.leading_snug, a.font_medium];
  if (size === "small") return [a.text_sm, a.leading_snug, a.font_medium];
  return [a.text_xs, a.leading_snug, a.font_semi_bold];
}
