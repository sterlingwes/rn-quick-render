// Stand-in for bluesky-social-app's `#/components/Loader` module.
//
// Real Loader is a rotating SVG icon driven by
// `react-native-reanimated`'s `useSharedValue` / `withRepeat`
// pipeline plus `react-native-svg`. We have no host for either.
//
// `StepInterests` only renders Loader inside the Continue button
// when `saving === true`. The fixture renders the resting state
// (`saving = false`), so the Loader never actually mounts. We
// still ship a placeholder export so the bsky import resolves —
// the component renders a tiny grey square if anything ever
// flips `saving` to true in a future fixture.

import * as React from "react";
import { View } from "react-native";

export function Loader({ size = 16 }: { size?: number; [key: string]: unknown }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#79808E",
      }}
    />
  );
}
