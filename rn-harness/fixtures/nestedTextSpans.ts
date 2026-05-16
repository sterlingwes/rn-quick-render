import React from "react";
import { RCTView, richParagraph, span } from "./_dsl";

// Exercises nested <Text> spans inside a single paragraph: the base style
// flows through plain runs while each RCTText span overrides weight, colour,
// and size. Real RN lowers this to RCTParagraph + interleaved RCTRawText /
// RCTText children; the translator needs SpannableStringBuilder spans, not
// a flat concatenation, to render it faithfully.
export default React.createElement(
  RCTView,
  { style: { padding: 16, backgroundColor: "#FFFFFF" } },
  richParagraph(
    { fontSize: 16, color: "#1A1A1A" },
    "Welcome, ",
    span("Wes", { fontWeight: "bold" }, "name"),
    ". You have ",
    span("3 new", { fontWeight: "600", color: "#E91E63" }, "count"),
    " messages and ",
    span("1 reminder", { fontSize: 12, color: "#666666" }, "reminder"),
    ".",
  ),
);
