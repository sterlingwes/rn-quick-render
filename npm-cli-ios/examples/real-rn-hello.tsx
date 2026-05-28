import React from "react";

// Uses real react-native components (View, Text) instead of the host-element
// DSL. Requires loadRealRn() to bootstrap the full RN module graph under
// Node — the bootstrap calls loadRealRn() before requiring the fixture, so
// `react-native` resolves to the stubbed runtime.
//
// Because the bootstrap loads RN ahead of this file's require, we can
// import from "react-native" directly at module scope.
import { View, Text } from "react-native";

export default React.createElement(
  View,
  {
    style: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "#F5F5F5",
    },
  },
  React.createElement(
    View,
    {
      style: {
        backgroundColor: "#FFFFFF",
        padding: 24,
        borderRadius: 12,
        shadowOpacity: 0.1,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      },
    },
    React.createElement(
      Text,
      {
        style: {
          fontSize: 24,
          fontWeight: "700",
          color: "#1A1A1A",
          textAlign: "center",
        },
      },
      "Hello from React Native",
    ),
    React.createElement(
      Text,
      {
        style: {
          fontSize: 14,
          color: "#666666",
          marginTop: 8,
          textAlign: "center",
        },
      },
      "This uses real View and Text components",
    ),
  ),
);
