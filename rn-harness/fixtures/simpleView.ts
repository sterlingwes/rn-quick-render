import React from "react";
import { RCTView } from "./_dsl";

// Single view, no children. The smallest possible Fabric tree.
export default React.createElement(RCTView, {
  style: { width: 320, height: 120, backgroundColor: "#3F51B5" },
  testID: "simple-view",
});
