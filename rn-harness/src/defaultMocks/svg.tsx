// react-native-svg mock. The renderer has no SVG host (docs/phase-3.md,
// out of scope), so every SVG element collapses to a sized placeholder
// <View>. The top-level <Svg> maps its width/height props onto style so
// the placeholder occupies the declared canvas footprint even when the
// caller sizes it via props rather than style.

import * as React from "react";
import { placeholderView } from "./placeholder";

function svgEl(label: string) {
  const Base = placeholderView(label);
  function SvgElement(props: any) {
    const sized =
      props?.width != null || props?.height != null
        ? { width: props.width, height: props.height }
        : null;
    const style = sized ? [sized, props?.style] : props?.style;
    return React.createElement(Base, { ...props, style });
  }
  SvgElement.displayName = label;
  return SvgElement;
}

const Svg = svgEl("Svg");
export default Svg;
export { Svg };

export const Path = svgEl("Path");
export const Circle = svgEl("Circle");
export const Rect = svgEl("Rect");
export const G = svgEl("G");
export const Defs = svgEl("Defs");
export const LinearGradient = svgEl("LinearGradient");
export const RadialGradient = svgEl("RadialGradient");
export const Stop = svgEl("Stop");
export const ClipPath = svgEl("ClipPath");
export const Polygon = svgEl("Polygon");
export const Polyline = svgEl("Polyline");
export const Line = svgEl("Line");
export const Ellipse = svgEl("Ellipse");
export const Text = svgEl("SvgText");
export const TSpan = svgEl("TSpan");
export const TextPath = svgEl("TextPath");
export const Use = svgEl("Use");
export const Symbol = svgEl("SvgSymbol");
export const Mask = svgEl("Mask");
export const Pattern = svgEl("Pattern");
export const Image = svgEl("SvgImage");
export const ForeignObject = svgEl("ForeignObject");
