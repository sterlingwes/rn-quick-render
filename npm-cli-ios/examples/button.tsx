import React from "react";
import { RCTView, paragraph } from "../src/dsl";

// Simple button: centered text, rounded corners, accent background.
// Host-element DSL — no full react-native import needed. Wrapped in a
// flex:1 screen container with a non-white background + top padding so
// the button clears the iPhone status bar overlay.

const Button = React.createElement(
  RCTView,
  {
    style: {
      backgroundColor: "#007AFF",
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: "center",
      margin: 16,
    },
    testID: "demo-button",
  },
  paragraph("Continue", {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
  }),
);

export default React.createElement(
  RCTView,
  { style: { flex: 1, backgroundColor: "#F5F5F5", paddingTop: 80 } },
  Button,
);
