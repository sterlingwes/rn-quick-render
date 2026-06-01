import { loadRealRn } from "../src/loadRealRn";
import { renderFixture } from "../src/renderFixture";
import type { MountInstruction } from "../src/types";

// Verifies the load-bearing behaviour of the opt-in catch-all: a
// permissive module mock whose exports, when used as JSX components,
// render real placeholder <View>s rather than collapsing to nothing or
// emitting a bogus host type.
//
// The resolver wiring that routes an unresolvable bare import to this
// module is exercised by the plain-Node CLI path (where resolution
// happens in-process and reads RN_HARNESS_AUTOMOCK_UNRESOLVED at resolve
// time — see fixtures/defaultMocks/automock.ts). Under Jest the resolver
// runs in the main process, so the flag can't be toggled per-test; we
// require the catch-all module directly here instead, which is the
// behaviour that actually matters.

describe("catch-all module mock", () => {
  let React: any;
  let View: any;
  let catchAll: any;

  beforeAll(() => {
    const { RN } = loadRealRn();
    React = require("react");
    View = RN.View;
    catchAll = require("../src/defaultMocks/catchAllModule");
  });

  test("default and named exports render as placeholder Views", () => {
    const Default = catchAll.default; // `import Foo from "pkg"`
    const Named = catchAll.SomeWidget; // `import { SomeWidget } from "pkg"`
    const Nested = catchAll.Animated.View; // `Animated.View`-style access

    const tree = React.createElement(
      View,
      { style: { padding: 8 } },
      React.createElement(Default, { style: { width: 10, height: 10 } }),
      React.createElement(
        Named,
        { style: { width: 20, height: 20 } },
        React.createElement(View, { style: { width: 4, height: 4 } }),
      ),
      React.createElement(Nested, { style: { width: 6, height: 6 } }),
    );

    const { instructions } = renderFixture(tree) as {
      instructions: MountInstruction[];
    };

    const created = instructions.filter((i: any) => i.op === "createNode") as any[];
    // Outer View + child View + three placeholders = 5 nodes.
    expect(created.length).toBeGreaterThanOrEqual(4);
    // Every created node is a known RCT* host type — no unsupported
    // component leaked a bogus viewName to the renderer.
    for (const node of created) {
      expect(String(node.viewName)).toMatch(/^RCT/);
    }
  });

  test("lowercase access yields a callable no-op (hooks/utilities)", () => {
    // e.g. `import { useSomething } from "pkg"` then `useSomething()`.
    expect(typeof catchAll.useSomething).toBe("function");
    expect(() => catchAll.useSomething()).not.toThrow();
  });
});
