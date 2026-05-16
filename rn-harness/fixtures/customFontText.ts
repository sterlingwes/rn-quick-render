import React from "react";
import { RCTView, paragraph, richParagraph, span } from "./_dsl";

// Exercises custom font resolution. The font family "TestMono" is registered
// JVM-side by the renderer test (LiberationMono-Regular.ttf, a monospaced
// face deliberately different from Roboto). Three rows let the golden diff
// catch each layer of the pipeline:
//
//  1. Paragraph-level fontFamily — sets the TextView's base typeface.
//  2. Per-span fontFamily — TypefaceSpan on a single nested <Text>.
//  3. fontFamily + fontWeight — the registry has to return a bold variant
//     synthesised from the registered Typeface.
//
// An unregistered "MissingFont" family is also rendered to confirm the
// fallback path goes to Roboto (and stderr gets a one-line warning, which
// the test asserts indirectly via the visual fallback).

const PARAGRAPH_BASE = { fontSize: 18, color: "#1A1A1A" };
const ROW_STYLE = { marginBottom: 12 };

export default React.createElement(
  RCTView,
  { style: { padding: 16, backgroundColor: "#FFFFFF" } },

  React.createElement(
    RCTView,
    { style: ROW_STYLE, key: "base" },
    paragraph("paragraph-level fontFamily", { fontSize: 12, color: "#666666", marginBottom: 2 }),
    paragraph("monospaced via TestMono", { ...PARAGRAPH_BASE, fontFamily: "TestMono" }),
  ),

  React.createElement(
    RCTView,
    { style: ROW_STYLE, key: "span" },
    paragraph("per-span fontFamily on the bold word", { fontSize: 12, color: "#666666", marginBottom: 2 }),
    richParagraph(
      PARAGRAPH_BASE,
      "the ",
      span("MONO", { fontFamily: "TestMono", fontWeight: "bold" }, "mono"),
      " word stands out",
    ),
  ),

  React.createElement(
    RCTView,
    { style: ROW_STYLE, key: "bold" },
    paragraph("bold weight on registered family", { fontSize: 12, color: "#666666", marginBottom: 2 }),
    paragraph("bold TestMono via fontWeight", { ...PARAGRAPH_BASE, fontFamily: "TestMono", fontWeight: "bold" }),
  ),

  React.createElement(
    RCTView,
    { style: ROW_STYLE, key: "missing" },
    paragraph("unregistered family falls back to default", { fontSize: 12, color: "#666666", marginBottom: 2 }),
    paragraph("MissingFont label", { ...PARAGRAPH_BASE, fontFamily: "MissingFont" }),
  ),
);
