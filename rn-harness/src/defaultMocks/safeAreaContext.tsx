// react-native-safe-area-context mock. Providers pass through to a <View>;
// the inset/frame hooks return zeroed values so layout that adds
// `insets.top` etc. stays deterministic in a headless capture. Faithful
// hook shapes are why this is a curated mock rather than the blind
// catch-all proxy.

import * as React from "react";
import { placeholderView } from "./placeholder";

const insets = { top: 0, right: 0, bottom: 0, left: 0 };
const frame = { x: 0, y: 0, width: 0, height: 0 };

export const SafeAreaProvider = placeholderView("SafeAreaProvider");
export const SafeAreaView = placeholderView("SafeAreaView");

export const useSafeAreaInsets = () => insets;
export const useSafeAreaFrame = () => frame;
export const withSafeAreaInsets = (C: any) => C;

export const SafeAreaInsetsContext = React.createContext(insets);
export const SafeAreaFrameContext = React.createContext(frame);
export const initialWindowMetrics = { insets, frame };
export const initialWindowSafeAreaInsets = insets;

export default {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
  useSafeAreaFrame,
  SafeAreaInsetsContext,
  initialWindowMetrics,
};
