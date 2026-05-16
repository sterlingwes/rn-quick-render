import React from "react";
import { RCTView, paragraph } from "./_dsl";

// Multi-frame fixture: same tree shape rendered twice with different props.
// The second render reconciles against the first, so Fabric emits
// cloneNodeWithNewProps / cloneNodeWithNewChildren / appendChild for the
// changed branch and a fresh childSet + completeRoot for the new root.
// Exercises the translator's update path; the rendered snapshot reflects
// the final (second-frame) tree.

function frame(count: number, accent: string) {
  return React.createElement(
    RCTView,
    { style: { padding: 16, backgroundColor: "#FFFFFF" } },
    paragraph("Inbox", { fontSize: 18, fontWeight: "600", color: "#1A1A1A" }),
    paragraph(`${count} unread`, { fontSize: 14, color: accent, marginTop: 4 }),
  );
}

export default [
  frame(0, "#999999"),
  frame(3, "#E91E63"),
];
