// Stand-in for bluesky-social-app's `#/components/Button` module.
//
// Admonition.tsx imports `Button as BaseButton, type ButtonProps`
// purely so that its own `Admonition.Button` re-export can wrap it.
// The tier-2 fixture renders `<Admonition>`, not `Admonition.Button`,
// so this stub never actually mounts at runtime — it only needs to
// satisfy the import-time evaluation so loading Admonition.tsx
// doesn't pull in the real Button graph (which transitively wants
// Pressable, gesture handler, the full alf flatten/select pipeline,
// and `#/components/Typography`'s emoji machinery).
//
// If a future fixture renders an `Admonition.Button`, swap in a
// real(er) Button mock.

import * as React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

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
