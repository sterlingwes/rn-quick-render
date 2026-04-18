import React from "react";
import { RCTView, paragraph } from "./_dsl";

// Uses React state transitions during a single render cycle via a component
// that decides what to show based on a static condition. Lets us observe
// how Fabric lowers conditional children.
function Card({ showBadge, title }: { showBadge: boolean; title: string }) {
  return React.createElement(
    RCTView,
    { style: { flexDirection: "row", alignItems: "center", padding: 8 } },
    showBadge
      ? React.createElement(RCTView, {
          key: "badge",
          style: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#E91E63", marginEnd: 8 },
        })
      : null,
    paragraph(title, { fontSize: 14, color: "#1A1A1A" }),
  );
}

export default React.createElement(
  RCTView,
  { style: { flexDirection: "column", padding: 16, backgroundColor: "#fff" } },
  React.createElement(Card, { key: "a", showBadge: true, title: "Unread message" }),
  React.createElement(Card, { key: "b", showBadge: false, title: "Read message" }),
  React.createElement(Card, { key: "c", showBadge: true, title: "Another unread" }),
);
