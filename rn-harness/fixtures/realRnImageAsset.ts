import React from "react";
import { loadRealRn } from "../src/loadRealRn";

// Proves the Phase 3 #2 contract end-to-end: an image asset referenced
// via `require('./assets/quadrant.png')` flows through the asset
// require hook, out of the real RN <Image> component, into the
// captured mount-instruction stream, and finally to a `file://` URI
// the renderer's `decodeImage` already knows how to load.
//
// Compare the rendered PNG to imageResizeModes (data: URI in `_dsl.ts`)
// — both ultimately decode the same 64×64 four-quadrant source, so the
// pixel output for the matching resizeMode should match byte-for-byte.

const { RN } = loadRealRn();
const { View, Image } = RN;

const QUADRANT_SOURCE = require("./assets/quadrant.png");

export default React.createElement(
  View,
  { style: { padding: 16, backgroundColor: "#FFFFFF" } },
  React.createElement(Image, {
    source: QUADRANT_SOURCE,
    resizeMode: "contain",
    style: { width: 200, height: 100, backgroundColor: "#F0F0F0" },
  }),
);
