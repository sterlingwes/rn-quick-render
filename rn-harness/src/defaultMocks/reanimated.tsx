// react-native-reanimated mock. Capture is a single resting frame, so
// animations don't run (docs/phase-3.md, "Out of scope"): Animated.* views
// pass through to a plain <View> preserving children/style, and the
// worklet/value helpers are inert, returning their seed value where one is
// read synchronously during render.

import * as React from "react";
import { placeholderView } from "./placeholder";

const AnimatedView = placeholderView("Animated.View");
const AnimatedText = placeholderView("Animated.Text");
const AnimatedImage = placeholderView("Animated.Image");
const AnimatedScrollView = placeholderView("Animated.ScrollView");

// `createAnimatedComponent(C)` wraps an arbitrary component; the resting
// snapshot is just that component, so hand it straight back.
const createAnimatedComponent = (C: any) => C ?? AnimatedView;

const Animated: any = {
  View: AnimatedView,
  Text: AnimatedText,
  Image: AnimatedImage,
  ScrollView: AnimatedScrollView,
  createAnimatedComponent,
};

export default Animated;
export { AnimatedView as View, AnimatedText as Text, createAnimatedComponent };

export const useSharedValue = (init: any) => ({ value: init });
export const useDerivedValue = (fn: any) => ({
  value: typeof fn === "function" ? safeCall(fn) : undefined,
});
export const useAnimatedStyle = (fn: any) =>
  typeof fn === "function" ? safeCall(fn) ?? {} : {};
export const useAnimatedRef = () => ({ current: null });
export const useAnimatedScrollHandler = () => () => {};
export const useAnimatedProps = (fn: any) =>
  typeof fn === "function" ? safeCall(fn) ?? {} : {};

export const withTiming = (v: any) => v;
export const withSpring = (v: any) => v;
export const withDecay = (v: any) => v;
export const withDelay = (_d: any, v: any) => v;
export const withRepeat = (v: any) => v;
export const withSequence = (...vs: any[]) => vs[vs.length - 1];
export const cancelAnimation = () => {};
export const runOnJS = (fn: any) => fn;
export const runOnUI = (fn: any) => fn;
export const interpolate = (..._a: any[]) => 0;
export const interpolateColor = (..._a: any[]) => "transparent";

export const Easing = new Proxy({}, { get: () => () => 0 });
export const Extrapolation = { CLAMP: "clamp", EXTEND: "extend", IDENTITY: "identity" };
export const Extrapolate = Extrapolation;

// Layout-animation builders are chainable no-ops (`.duration(…).delay(…)`).
const layoutBuilder: any = new Proxy(() => layoutBuilder, { get: () => () => layoutBuilder });
export const FadeIn = layoutBuilder;
export const FadeOut = layoutBuilder;
export const Layout = layoutBuilder;
export const LinearTransition = layoutBuilder;

// A reanimated worklet reads `.value` off shared values during render; our
// useSharedValue hands back the seed so the computed resting style is
// sensible. Guard against worklets that touch APIs we don't model.
function safeCall(fn: any): any {
  try {
    return fn();
  } catch {
    return undefined;
  }
}
