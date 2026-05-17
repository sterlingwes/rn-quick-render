// Stand-in for the bluesky-social-app icon modules under
// `#/components/icons/*` and the relative `./icons/Emoji` import
// inside `src/components/`.
//
// Real bsky icons compile SVG paths via
// `#/components/icons/TEMPLATE.createSinglePathSVG` and render
// through `react-native-svg`. We don't yet ship a renderer host
// for SVG, and pulling react-native-svg in would drag the whole
// native-side view-manager registration along with it.
//
// Each export below is a coloured-square placeholder sized by the
// `size` prop. The point is to (a) load without crashing, and (b)
// make it obvious in a snapshot diff that an icon is present at
// roughly the right footprint, without claiming the icon glyph
// itself is faithful. Tier-3+ work can swap this for actual SVG
// path rendering once the renderer grows it.

import * as React from "react";
import { View, type ViewStyle } from "react-native";

// Real bsky icons accept `size` as a string token ("xs" | "sm" |
// "md" | "lg" | "xl") *or* a number. Map tokens to the same dp
// values the upstream IconProps default scale uses so the placeholder
// rect occupies roughly the right footprint.
const SIZE_TOKEN: Record<string, number> = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 28,
};

type IconProps = {
  fill?: string;
  size?: keyof typeof SIZE_TOKEN | number;
  style?: ViewStyle | ViewStyle[];
};

function makeIcon(label: string) {
  function Placeholder({ fill = "#999999", size = "md", style }: IconProps) {
    const dp =
      typeof size === "number" ? size : SIZE_TOKEN[size] ?? SIZE_TOKEN.md;
    return (
      <View
        // Inline accessibilityLabel keeps the placeholder identifiable
        // in the captured tree without changing visible output.
        accessibilityLabel={label}
        style={[
          {
            width: dp,
            height: dp,
            backgroundColor: fill,
            borderRadius: 2,
          },
          style as ViewStyle,
        ]}
      />
    );
  }
  Placeholder.displayName = label;
  return Placeholder;
}

// One file is registered as the mock target for each of the four
// icon modules Admonition imports. Export every symbol any of them
// would expose; unused exports are dead code at runtime.
export const CircleInfo_Stroke2_Corner0_Rounded = makeIcon("CircleInfo");
export const CircleX_Stroke2_Corner0_Rounded = makeIcon("CircleX");
export const Warning_Stroke2_Corner0_Rounded = makeIcon("Warning");
export const EmojiSad_Stroke2_Corner0_Rounded = makeIcon("EmojiSad");
export const EmojiSmile_Stroke2_Corner0_Rounded = makeIcon("EmojiSmile");
export const EmojiArc_Stroke2_Corner0_Rounded = makeIcon("EmojiArc");
export const EmojiHeartEyes_Stroke2_Corner0_Rounded = makeIcon("EmojiHeartEyes");
