// Public host-element DSL for authoring fixtures.
//
// This file is a verbatim copy of rn-harness/fixtures/_dsl.ts. Keep aligned
// when the harness DSL changes — the two are the public capture contract.
// (We inline rather than re-export because rn-harness ships only its TS
// source today, with no built dist or exports map; re-exporting would
// couple our published surface to whatever import path the harness
// eventually adopts.)

import React from "react";

export const RCTView = "RCTView" as unknown as React.ElementType;
export const RCTRawText = "RCTRawText" as unknown as React.ElementType;
export const RCTText = "RCTText" as unknown as React.ElementType;
export const RCTSinglelineTextInputView =
  "RCTSinglelineTextInputView" as unknown as React.ElementType;
export const RCTImageView = "RCTImageView" as unknown as React.ElementType;
export const RCTScrollView = "RCTScrollView" as unknown as React.ElementType;
export const RCTScrollContentView = "RCTScrollContentView" as unknown as React.ElementType;
export const RCTParagraph = "RCTParagraph" as unknown as React.ElementType;

export function paragraph(text: string, style?: React.CSSProperties) {
  return React.createElement(
    RCTParagraph,
    { style },
    React.createElement(RCTRawText, { text }),
  );
}

export function span(text: string, style?: React.CSSProperties, key?: string) {
  return React.createElement(
    RCTText,
    { style, key },
    React.createElement(RCTRawText, { text }),
  );
}

export function richParagraph(
  paragraphStyle: React.CSSProperties | undefined,
  ...children: Array<string | React.ReactElement>
) {
  const elements = children.map((child, i) =>
    typeof child === "string"
      ? React.createElement(RCTRawText, { key: `t${i}`, text: child })
      : child,
  );
  return React.createElement(RCTParagraph, { style: paragraphStyle }, ...elements);
}
