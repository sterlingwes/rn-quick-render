import React from "react";
import { RCTView } from "./_dsl";

// Two rows of three children inside a column container. Representative of a
// common card layout.
const row = (key: string, tint: string) =>
  React.createElement(
    RCTView,
    { key, style: { flexDirection: "row", padding: 8, backgroundColor: tint } },
    React.createElement(RCTView, { key: "a", style: { width: 32, height: 32, backgroundColor: "#fff", marginEnd: 8 } }),
    React.createElement(RCTView, { key: "b", style: { width: 32, height: 32, backgroundColor: "#fff", marginEnd: 8 } }),
    React.createElement(RCTView, { key: "c", style: { width: 32, height: 32, backgroundColor: "#fff" } }),
  );

export default React.createElement(
  RCTView,
  { style: { flexDirection: "column", padding: 16, backgroundColor: "#F5F5F5" } },
  row("r1", "#E3F2FD"),
  row("r2", "#FCE4EC"),
);
