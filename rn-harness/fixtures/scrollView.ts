import React from "react";
import { RCTScrollContentView, RCTScrollView, RCTView } from "./_dsl";

// Scroll container with six child rows. Fabric uses RCTScrollContentView as
// the inner content box — that split is visible in the instruction stream.
const rows = Array.from({ length: 6 }, (_, i) =>
  React.createElement(RCTView, {
    key: String(i),
    style: { height: 44, marginBottom: 8, backgroundColor: i % 2 === 0 ? "#EEEEEE" : "#DDDDDD" },
  }),
);

export default React.createElement(
  RCTScrollView,
  { style: { flex: 1 }, showsVerticalScrollIndicator: true },
  React.createElement(RCTScrollContentView, { style: { padding: 16 } }, ...rows),
);
