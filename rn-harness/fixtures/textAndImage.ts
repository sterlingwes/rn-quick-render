import React from "react";
import { RCTImageView, RCTView, paragraph } from "./_dsl";

// Icon + headline + subtitle row. Exercises text nodes and a raw image source.
export default React.createElement(
  RCTView,
  { style: { flexDirection: "row", padding: 16, alignItems: "center", backgroundColor: "#fff" } },
  React.createElement(RCTImageView, {
    key: "icon",
    style: { width: 48, height: 48, marginEnd: 12 },
    source: { uri: "https://example.com/logo.png" },
    resizeMode: "contain",
  }),
  React.createElement(
    RCTView,
    { key: "stack", style: { flexDirection: "column", flex: 1 } },
    paragraph("Headline", { fontSize: 18, fontWeight: "600", color: "#1A1A1A" }),
    paragraph("Subtitle line", { fontSize: 14, color: "#666666" }),
  ),
);
