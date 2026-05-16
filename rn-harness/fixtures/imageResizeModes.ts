import React from "react";
import { RCTImageView, RCTView, TEST_QUADRANT_PNG, paragraph } from "./_dsl";

// Same 64×64 source PNG rendered into a 200×100 container at four resize
// modes. Each row labels the mode so the produced PNG documents the
// behaviour at a glance.
//
// Expected pixel-level outcome on the rendered snapshot:
//   cover    → image scaled so the 200×100 rect is fully filled; the
//              left/right edges of the source PNG are clipped.
//   contain  → image scaled to fit inside 200×100 preserving aspect; the
//              container background shows as letterboxing on the sides.
//   stretch  → image squashed/stretched to exactly 200×100; the source's
//              square quadrants become wide rectangles.
//   center   → image drawn at its native 64×64 size, centered, with the
//              container background visible around it.

const SOURCE = { uri: TEST_QUADRANT_PNG };
const CONTAINER_BG = "#F0F0F0";

function row(mode: "cover" | "contain" | "stretch" | "center") {
  return React.createElement(
    RCTView,
    { key: mode, style: { marginBottom: 12 } },
    paragraph(mode, { fontSize: 12, color: "#666666", marginBottom: 4 }),
    React.createElement(RCTImageView, {
      source: SOURCE,
      resizeMode: mode,
      style: { width: 200, height: 100, backgroundColor: CONTAINER_BG },
    }),
  );
}

export default React.createElement(
  RCTView,
  { style: { padding: 16, backgroundColor: "#FFFFFF" } },
  row("cover"),
  row("contain"),
  row("stretch"),
  row("center"),
);
