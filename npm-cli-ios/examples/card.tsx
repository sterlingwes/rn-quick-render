import React from "react";
import { RCTView, paragraph } from "../src/dsl";

// Notification-style card with a status dot, title, and subtitle.
// Demonstrates nested views and multi-row layout.

function StatusDot({ color }: { color: string }) {
  return React.createElement(RCTView, {
    style: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: color,
      marginEnd: 8,
    },
  });
}

function Card({ status, title, subtitle }: { status: string; title: string; subtitle: string }) {
  const dotColor =
    status === "success" ? "#4CAF50" : status === "error" ? "#F44336" : "#FF9800";
  return React.createElement(
    RCTView,
    {
      style: {
        flexDirection: "column",
        padding: 16,
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        margin: 16,
        shadowOpacity: 0.1,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      },
    },
    React.createElement(
      RCTView,
      { style: { flexDirection: "row", alignItems: "center", marginBottom: 4 } },
      React.createElement(StatusDot, { color: dotColor }),
      paragraph(title, { fontSize: 16, fontWeight: "600", color: "#1A1A1A" }),
    ),
    paragraph(subtitle, { fontSize: 13, color: "#666666" }),
  );
}

export default React.createElement(Card, {
  status: "success",
  title: "Deploy #1847",
  subtitle: "Succeeded · 3m ago · main branch",
});
