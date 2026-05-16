import React from "react";
import { RCTImageView, RCTView, TEST_QUADRANT_PNG, paragraph } from "./_dsl";

// Exercises two image-side renderer contracts the integration test will
// need:
//
//   1. `tintColor` — RN's flat tint applied via a PorterDuff SRC_IN
//      filter. Each row sets a different colour against the same
//      four-quadrant source PNG. The source's transparent pixels stay
//      transparent (alpha is preserved); the opaque pixels collapse to
//      the tint colour, so the four colored quadrants flatten into a
//      single coloured silhouette.
//
//   2. Metro-shaped source objects. Real RN's `require('./img.png')`
//      lowers to `{ uri, width, height, scale, __packager_asset: true }`.
//      Phase 3's AssetRegistry hook will be the thing that resolves
//      `uri` to a `file://` path, but the renderer's `decodeImage`
//      already only reads `source.uri` — the extra fields are
//      tolerated silently. This fixture pre-emptively ships the
//      Metro shape so the contract is exercised before that hook
//      lands.

// The same 64×64 source as imageResizeModes, packaged with the synthetic
// width/height/scale/__packager_asset fields a real Metro require
// would emit.
const METRO_SHAPED_SOURCE = {
  uri: TEST_QUADRANT_PNG,
  width: 64,
  height: 64,
  scale: 1,
  __packager_asset: true,
};

const CONTAINER_BG = "#F0F0F0";

function row(label: string, props: Record<string, unknown>) {
  return React.createElement(
    RCTView,
    { key: label, style: { marginBottom: 12 } },
    paragraph(label, { fontSize: 12, color: "#666666", marginBottom: 4 }),
    React.createElement(RCTImageView, {
      source: METRO_SHAPED_SOURCE,
      resizeMode: "contain",
      style: { width: 80, height: 80, backgroundColor: CONTAINER_BG },
      ...props,
    }),
  );
}

export default React.createElement(
  RCTView,
  { style: { padding: 16, backgroundColor: "#FFFFFF" } },
  row("control (no tintColor)", {}),
  row("tintColor #E91E63", { tintColor: "#E91E63" }),
  row("tintColor rgba(0,0,0,0.5)", { tintColor: "rgba(0,0,0,0.5)" }),
  row("tintColor #1976D2 + cover", { tintColor: "#1976D2", resizeMode: "cover" }),
);
