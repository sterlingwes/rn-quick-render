// Stand-in for bluesky-social-app's `#/components/Typography` module.
//
// Real Typography wraps `react-native-uitextview`'s UITextView,
// normalizes text styles via `#/alf/typography`, and runs an emoji
// pipeline that swaps any inline emoji glyphs for image spans. None
// of that machinery contributes anything the harness can paint
// distinctly from `react-native`'s Text, so we substitute a Text
// wrapper that preserves the public prop shape Admonition / its
// callers consume.

import * as React from "react";
import { Text as RNText, type StyleProp, type TextStyle } from "react-native";

import { atoms as a, useTheme } from "./alf";

export type TextProps = {
  children?: React.ReactNode;
  style?: StyleProp<TextStyle>;
  // The real Text accepts an `emoji` flag that gates the emoji
  // pipeline. Kept here so callers passing it don't break under
  // type-checking; ignored at runtime.
  emoji?: boolean;
  selectable?: boolean;
  numberOfLines?: number;
  title?: string;
  // Real component spreads UITextView's remaining props; tier
  // fixtures don't lean on any specific one yet.
  [key: string]: unknown;
};

// Real bsky Typography.Text applies `t.atoms.text` (theme text
// color) + `a.text_md` + `a.leading_relaxed` as a base before the
// caller's `style` override (Typography.tsx:32-33, :95). Without
// `t.atoms.text` every span inherits the TextView default (black)
// regardless of color scheme — dark-mode renders would still show
// black headlines on a near-black background. Without `text_md` /
// `leading_relaxed` every span renders at RN's 14sp default instead
// of bsky's 16pt body size.
export function Text({
  children,
  style,
  // strip-don't-forward props the real RN Text would warn on
  emoji: _emoji,
  title: _title,
  ...rest
}: TextProps) {
  const t = useTheme();
  return (
    <RNText style={[a.text_md, a.leading_relaxed, t.atoms.text, style]} {...rest}>
      {children}
    </RNText>
  );
}

// `Span` is re-exported from react-native's Text in real bsky. Mirror
// it here so any caller that does `import {Span} from
// '#/components/Typography'` keeps working.
export const Span = RNText;
