import React from "react";
import { loadRealRn } from "../../src/loadRealRn";

// Verification fixture for the opt-in catch-all (RN_HARNESS_AUTOMOCK_UNRESOLVED).
//
// `some-unsupported-lib` does not exist and is not in the curated pack.
// With the flag set, the resolver routes its bare import to the permissive
// catch-all proxy module instead of throwing MODULE_NOT_FOUND. The default
// export and a named export are both used as components and must render as
// placeholder <View>s — never as a bogus host type that the renderers
// can't build.
//
// Runnable example for the plain-Node CLI path, where resolution happens
// in-process and reads the flag at resolve time:
//
//   RN_HARNESS_AUTOMOCK_UNRESOLVED=1 node -r ts-node/register \
//     -e "require('./fixtures/defaultMocks/automock')"
//
// (Under Jest the resolver runs in the main process, so the catch-all
// can't be toggled per-test — test/automock.test.ts exercises the
// catch-all module's render behaviour directly instead.)

loadRealRn({ autoMockUnresolved: true });
const RN = require("react-native");
const { View, AppRegistry } = RN;

const Unsupported = require("some-unsupported-lib").default;
const { Widget } = require("some-unsupported-lib");

function AutomockHarness() {
  return React.createElement(
    View,
    { style: { padding: 8 } },
    React.createElement(Unsupported, { style: { width: 10, height: 10 } }),
    React.createElement(
      Widget,
      { style: { width: 20, height: 20 } },
      React.createElement(View, { style: { width: 4, height: 4 } }),
    ),
  );
}

AppRegistry.registerComponent("Automock", () => AutomockHarness);

const { captureFromAppKey } =
  require("../../src/captureFromAppKey") as typeof import("../../src/captureFromAppKey");

export default captureFromAppKey("Automock");
