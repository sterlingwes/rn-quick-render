import React from "react";

// Mini host-element DSL. We don't import `react-native`'s View/Text components
// because those pull in the full RN runtime. Instead, we render raw host types
// directly — which is what the component wrappers ultimately produce anyway.
export const RCTView = "RCTView" as unknown as React.ElementType;
export const RCTRawText = "RCTRawText" as unknown as React.ElementType;
export const RCTSinglelineTextInputView = "RCTSinglelineTextInputView" as unknown as React.ElementType;
export const RCTImageView = "RCTImageView" as unknown as React.ElementType;
export const RCTScrollView = "RCTScrollView" as unknown as React.ElementType;
export const RCTScrollContentView = "RCTScrollContentView" as unknown as React.ElementType;
export const RCTParagraph = "RCTParagraph" as unknown as React.ElementType;

// RCTParagraph wraps one or more RCTRawText leaves. That's how Fabric lowers
// <Text>Hello <Text>world</Text></Text> — a single RCTParagraph node owning
// N RCTRawText children. We preserve that shape in the fixtures so the
// Phase 2 translator has something representative to target.
export function paragraph(text: string, style?: React.CSSProperties) {
  return React.createElement(
    RCTParagraph,
    { style },
    React.createElement(RCTRawText, { text }),
  );
}
