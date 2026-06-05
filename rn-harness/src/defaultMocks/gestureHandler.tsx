// react-native-gesture-handler mock. Capture happens before any touch
// event (docs/phase-3.md, out of scope), so the rendered output is the
// resting state: handler wrappers and gesture-driven buttons pass through
// to a <View> preserving children, and the gesture builders are no-ops.

import { placeholderView } from "./placeholder";
import { deepNoopProxy } from "../nativeModuleStubs";

export const GestureHandlerRootView = placeholderView("GestureHandlerRootView");
export const ScrollView = placeholderView("GH.ScrollView");
export const FlatList = placeholderView("GH.FlatList");
export const PanGestureHandler = placeholderView("PanGestureHandler");
export const TapGestureHandler = placeholderView("TapGestureHandler");
export const LongPressGestureHandler = placeholderView("LongPressGestureHandler");
export const PinchGestureHandler = placeholderView("PinchGestureHandler");
export const FlingGestureHandler = placeholderView("FlingGestureHandler");
export const GestureDetector = placeholderView("GestureDetector");
export const RectButton = placeholderView("RectButton");
export const BaseButton = placeholderView("BaseButton");
export const BorderlessButton = placeholderView("BorderlessButton");
export const TouchableOpacity = placeholderView("GH.TouchableOpacity");
export const TouchableHighlight = placeholderView("GH.TouchableHighlight");
export const TouchableWithoutFeedback = placeholderView("GH.TouchableWithoutFeedback");

export const enableExperimentalWebImplementation = () => {};
export const gestureHandlerRootHOC = (C: any) => C;

// `Gesture.Pan().onUpdate(...)`-style chains resolve to inert no-ops.
export const Gesture = deepNoopProxy("Gesture");
export const State = {};
export const Directions = {};

export default {
  GestureHandlerRootView,
  PanGestureHandler,
  GestureDetector,
  Gesture,
  State,
  Directions,
};
