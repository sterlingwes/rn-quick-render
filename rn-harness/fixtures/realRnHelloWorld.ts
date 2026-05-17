import React from "react";
import { loadRealRn } from "../src/loadRealRn";

// First fixture that exercises the real `react-native` package (rather
// than the host-element DSL the other fixtures import from `_dsl.ts`).
// Demonstrates that `View` and `Text` from `react-native` boot in the
// harness against a no-op NativeModules / TurboModuleRegistry shim, then
// flow through Fabric to the same mount-instruction stream the renderer
// already understands.
//
// Everything above the rendered component is the developer's
// responsibility (see docs/phase-3.md "What the developer brings") —
// this fixture supplies its own native-module overrides if/when the
// renderer needs them.

const { RN } = loadRealRn();
const { View, Text } = RN;

export default React.createElement(
  View,
  { style: { padding: 16, backgroundColor: "#FFFFFF" } },
  React.createElement(
    Text,
    { style: { fontSize: 16, color: "#1A1A1A" } },
    "Hello from real react-native",
  ),
);
