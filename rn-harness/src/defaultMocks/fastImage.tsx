// react-native-fast-image mock. FastImage's {uri,…} source shape is a
// superset of RN <Image>'s, so render through the real Image — the
// renderer already handles data:/file:/ sources. The static enum maps are
// preserved because callers reference FastImage.resizeMode.cover etc.

import * as React from "react";
import { Image } from "react-native";

const resizeMode = { contain: "contain", cover: "cover", stretch: "stretch", center: "center" } as const;
const priority = { low: "low", normal: "normal", high: "high" } as const;
const cacheControl = { immutable: "immutable", web: "web", cacheOnly: "cacheOnly" } as const;

function FastImage(props: any) {
  return React.createElement(Image, props);
}
FastImage.displayName = "FastImage";
FastImage.resizeMode = resizeMode;
FastImage.priority = priority;
FastImage.cacheControl = cacheControl;

export default FastImage;
export { resizeMode, priority, cacheControl };
