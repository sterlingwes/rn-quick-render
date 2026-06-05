import React from "react";
import { loadRealRn } from "../../src/loadRealRn";

// Verification fixture for the curated default-mock pack (Layer A).
//
// Imports three packages that are NOT installed and whose native side
// would throw at import time on a real device-less Node process:
//   - react-native-reanimated
//   - react-native-svg
//   - react-native-safe-area-context
//
// The curated resolver intercepts each request string (no flag needed)
// and routes it to a hand-written placeholder mock, so the screen loads
// and every unsupported visual element collapses to a plain <View> in the
// captured mount stream. The captured tree should contain only RCT* host
// types — identical for the Android Kotlin renderer and the iOS render
// server, since both consume the same instruction stream.

const { RN } = loadRealRn();
const { View, Text, AppRegistry } = RN;

// require *after* loadRealRn so the resolver hooks are installed first.
const Animated = require("react-native-reanimated").default;
const { Svg, Path, Circle } = require("react-native-svg");
const {
  SafeAreaProvider,
  useSafeAreaInsets,
} = require("react-native-safe-area-context");

function CuratedMockHarness() {
  // Exercises a curated hook (zeroed insets) on the layout path.
  const insets = useSafeAreaInsets();
  return React.createElement(
    SafeAreaProvider,
    null,
    React.createElement(
      View,
      { style: { padding: 16 + insets.top, backgroundColor: "#FFFFFF" } },
      React.createElement(Text, null, "curated mocks"),
      React.createElement(
        Animated.View,
        { style: { width: 80, height: 80, backgroundColor: "#EEEEEE" } },
        React.createElement(
          Svg,
          { width: 40, height: 40 },
          React.createElement(Circle, { cx: 20, cy: 20, r: 18, fill: "#3366FF" }),
          React.createElement(Path, { d: "M0 0 L40 40", stroke: "#000000" }),
        ),
      ),
    ),
  );
}

AppRegistry.registerComponent("CuratedMock", () => CuratedMockHarness);

const { captureFromAppKey } =
  require("../../src/captureFromAppKey") as typeof import("../../src/captureFromAppKey");

export default captureFromAppKey("CuratedMock");
