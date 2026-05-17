// Stand-in for bluesky-social-app's `#/components/Button` module.
//
// The real Button file is ~900 lines: solid/outline/ghost variants,
// 6 colour tokens, 4 sizes, 4 shapes, a Pressable backbone, hover/
// focus/press state contexts, ButtonIcon + ButtonText sub-components
// with shared text styles, ButtonHitslop, the Link extension, and
// platform-conditional accessibility wiring. None of that machinery
// contributes anything the harness can paint distinctly from a plain
// View+Text wrap.
//
// This mock exposes the surface tier fixtures import (Button,
// ButtonText, plus ButtonProps for typing) as the thinnest possible
// View / Text wrappers, so consumers can still nest content inside
// without the real Button graph getting pulled in. If a future
// fixture needs ButtonIcon or pressed-state visuals, extend here
// rather than dragging in the real Button.tsx.

import * as React from "react";
import {
  Text as RNText,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

export type ButtonProps = {
  children?: React.ReactNode;
  label?: string;
  size?: "tiny" | "small" | "large";
  variant?: "solid" | "outline" | "ghost";
  color?: string;
  shape?: "default" | "round" | "square" | "rectangular";
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  [key: string]: unknown;
};

export function Button({ children, style }: ButtonProps) {
  return <View style={style as ViewStyle}>{children}</View>;
}

export type ButtonTextProps = {
  children?: React.ReactNode;
  style?: StyleProp<TextStyle>;
  [key: string]: unknown;
};

// Real ButtonText pulls colour + size styling from the parent
// Button's context (useSharedButtonTextStyles). The tier-3 fixture
// only needs the structural Text node, not the visual variant —
// label visuals come from any inline `style` the caller passes.
export function ButtonText({ children, style }: ButtonTextProps) {
  return <RNText style={style as TextStyle}>{children}</RNText>;
}
