import React from "react";
import { RCTView, paragraph } from "./_dsl";

// One labeled row per visual effect. Each row holds two identical 64×64
// blue boxes: the left is the reference (no effect), the right has the
// effect applied. The visual diff between them is the test.

const BOX_SIZE = 64;
const ROW_MARGIN = 12;
const REFERENCE_COLOR = "#3F51B5";

// RN style props include things React.CSSProperties doesn't know about
// (`transform` array, `elevation`). Loose-type the effect to keep
// fixtures readable.
function row(label: string, effect: Record<string, unknown>) {
  return React.createElement(
    RCTView,
    { key: label, style: { marginBottom: ROW_MARGIN } },
    paragraph(label, { fontSize: 12, color: "#666666", marginBottom: 4 }),
    React.createElement(
      RCTView,
      { style: { flexDirection: "row", alignItems: "center" } },
      React.createElement(RCTView, {
        key: "ref",
        style: { width: BOX_SIZE, height: BOX_SIZE, backgroundColor: REFERENCE_COLOR },
      }),
      React.createElement(RCTView, { key: "spacer", style: { width: 32 } }),
      React.createElement(RCTView, {
        key: "effect",
        style: {
          width: BOX_SIZE,
          height: BOX_SIZE,
          backgroundColor: REFERENCE_COLOR,
          ...effect,
        },
      }),
    ),
  );
}

export default React.createElement(
  RCTView,
  { style: { padding: 32, backgroundColor: "#FFFFFF" } },
  row("translateX 24, translateY 8", { transform: [{ translateX: 24 }, { translateY: 8 }] }),
  row("rotate 15deg", { transform: [{ rotate: "15deg" }] }),
  row("scale 1.3", { transform: [{ scale: 1.3 }] }),
  row("opacity 0.4", { opacity: 0.4 }),
  row("elevation 8 (shadow)", { elevation: 8 }),
);
