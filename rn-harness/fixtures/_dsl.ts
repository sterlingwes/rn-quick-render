import React from "react";

// Mini host-element DSL. We don't import `react-native`'s View/Text components
// because those pull in the full RN runtime. Instead, we render raw host types
// directly — which is what the component wrappers ultimately produce anyway.
export const RCTView = "RCTView" as unknown as React.ElementType;
export const RCTRawText = "RCTRawText" as unknown as React.ElementType;
export const RCTText = "RCTText" as unknown as React.ElementType;
export const RCTSinglelineTextInputView = "RCTSinglelineTextInputView" as unknown as React.ElementType;
export const RCTImageView = "RCTImageView" as unknown as React.ElementType;
export const RCTScrollView = "RCTScrollView" as unknown as React.ElementType;
export const RCTScrollContentView = "RCTScrollContentView" as unknown as React.ElementType;
export const RCTParagraph = "RCTParagraph" as unknown as React.ElementType;

// RCTParagraph wraps one or more RCTRawText leaves. That's how Fabric lowers
// <Text>Hello world</Text> — a single RCTParagraph node owning RCTRawText
// children. Nested <Text>…<Text>…</Text>…</Text> introduces RCTText, a virtual
// span with its own style that contains RCTRawText leaves. RCTText nodes are
// not Yoga layout nodes; they only contribute style runs to the parent
// paragraph's measured + drawn text.
export function paragraph(text: string, style?: React.CSSProperties) {
  return React.createElement(
    RCTParagraph,
    { style },
    React.createElement(RCTRawText, { text }),
  );
}

// One inline span inside a paragraph. Use inside a richParagraph's children.
export function span(text: string, style?: React.CSSProperties, key?: string) {
  return React.createElement(
    RCTText,
    { style, key },
    React.createElement(RCTRawText, { text }),
  );
}

// A paragraph whose children may be a mix of plain strings (raw text) and
// nested RCTText spans produced by span().
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
