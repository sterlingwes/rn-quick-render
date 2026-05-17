import React from "react";
import { loadRealRn } from "../src/loadRealRn";
import { captureFromAppKey } from "../src/captureFromAppKey";

// Proves the AppRegistry-driven entry: simulates an app's `index.js`
// by registering a root component under an appKey, then asks
// captureFromAppKey to produce the React element a real device's
// ReactRootView would mount for that key.
//
// What ends up in the capture is the real RN wrap a device would
// see: an AppContainer (flex:1 root View + RootTagContext provider)
// around the registered RootComponent, with `rootTag` + initialProps
// threaded through exactly the way `runApplication` would. That
// outer View matters for layout — a screen that expects flex:1 from
// the root would otherwise mount with intrinsic sizing in our
// snapshot.

const { RN } = loadRealRn();
const { View, Text, AppRegistry } = RN;

function RegisteredApp({ greeting }: { greeting: string }) {
  return React.createElement(
    View,
    { style: { padding: 24, backgroundColor: "#F8F8FA" } },
    React.createElement(
      Text,
      { style: { fontSize: 22, color: "#0E0E13", fontWeight: "bold" } },
      greeting,
    ),
    React.createElement(
      Text,
      { style: { fontSize: 14, color: "#5A5A66", marginTop: 8 } },
      "Rendered via AppRegistry.registerComponent + captureFromAppKey",
    ),
  );
}

AppRegistry.registerComponent("RegisteredApp", () => RegisteredApp);

export default captureFromAppKey("RegisteredApp", { greeting: "Hello, AppRegistry" });
