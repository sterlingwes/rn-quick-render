import React from "react";
import { RCTView, paragraph } from "../src/dsl";

// Simple button: centered text, rounded corners, accent background.
// Host-element DSL — no full react-native import needed.

export default React.createElement(
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
