// Shared "placeholder as View" factory for the curated default-mock pack.
// Mirrors the idiom in src/realApp/blueskyMocks/icons.tsx: a component
// whose only job is to (a) load without crashing and (b) occupy roughly
// the right footprint in the captured mount stream. The placeholder
// renders a plain RN <View>, so the SAME mock flows through the Android
// Kotlin renderer and the iOS render server unchanged — both just see an
// RCTView in the instruction stream.
//
// `children` are preserved so wrapper/provider components
// (SafeAreaProvider, Animated.View, GestureHandlerRootView) keep their
// subtree; `style` is forwarded so the placeholder honours any size the
// caller declared.

import * as React from "react";
import { View, type ViewStyle } from "react-native";

export function placeholderView(label: string) {
  function Placeholder(props: any) {
    return React.createElement(
      View,
      {
        // Identifies the mock in the captured tree without changing
        // visible output.
        accessibilityLabel: `<mock:${label}>`,
        style: props?.style as ViewStyle,
      },
      props?.children,
    );
  }
  Placeholder.displayName = label;
  return Placeholder;
}
