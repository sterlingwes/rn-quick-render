// Two cooperating hooks that make `require("react-native")` boot under
// plain Node (the `npm run capture` CLI):
//
//   1. A Babel require-hook so RN's Flow-annotated `.js` files parse.
//      RN ships uncompiled source — modern files include the new Flow
//      `component View(...)` syntax that plain Node can't handle.
//      `@react-native/babel-preset` is the same preset Metro uses on a
//      real app, so we strip the same Flow features the platform
//      expects and don't introduce a second source of truth.
//
//   2. A platform-aware module resolver. RN's source uses
//      `Foo.android.js` / `Foo.ios.js` and a dispatching `Foo.js` that
//      self-imports `./Foo`. Metro resolves the self-import to the
//      platform-specific file; plain Node resolves it to itself and
//      the import comes back undefined. The hook below intercepts
//      relative `require()`s from within `node_modules/react-native`
//      and tries `*.android.{js,ts,jsx,tsx}` before falling back.
//
// Under Jest, both responsibilities move elsewhere:
//   - `src/jestRnResolver.js` handles the .android.js resolution
//     (Jest uses its own resolver pipeline that ignores
//     Module._resolveFilename patches).
//   - `babel-jest` (configured via jest.config.js + babel.config.js)
//     transforms the Flow source.
// So this module is a no-op when JEST_WORKER_ID is set — installing
// @babel/register inside Jest workers fights with babel-jest and
// reliably breaks on certain RN plugin chains.

import Module from "module";
import path from "path";

const isJest = typeof process !== "undefined" && process.env.JEST_WORKER_ID !== undefined;

import { realAppResolverPaths, realAppOverrides } from "./realAppResolver";

// Shared curated/catch-all default-mock table (plain CommonJS so the
// Jest resolver can require the same source). See defaultMocks/registry.js.
const { curatedOverride, catchAllOverride } = require("./defaultMocks/registry") as {
  curatedOverride: (request: string) => string | null;
  catchAllOverride: (request: string) => string | null;
};

if (!isJest) {
  const RN_ROOTS = [
    // Real RN under node_modules/react-native/**.
    path.dirname(require.resolve("react-native/package.json")),
    // The @react-native/* siblings ship the same Flow-annotated source.
    path.dirname(path.dirname(require.resolve("react-native/package.json"))),
  ];
  const ANDROID_EXTENSIONS = [".android.ts", ".android.tsx", ".android.js", ".android.jsx"];
  const RN_PREFIX = RN_ROOTS[0] + path.sep;

  // Roots whose .ts/.tsx/.js source we want Babel to transform —
  // beyond the RN package itself, this picks up any real-app
  // submodule under third_party/<target>/ so the target's
  // unmodified TypeScript sources load under Node.
  const REAL_APP_ROOTS = realAppResolverPaths();
  const TRANSFORM_ROOTS = [...RN_ROOTS, ...REAL_APP_ROOTS.map((p) => p.root)];

  const HARNESS_NODE_MODULES = path.resolve(__dirname, "..", "node_modules");

  const originalResolve = (Module as any)._resolveFilename as (
    request: string,
    parent: NodeJS.Module | null,
    ...rest: unknown[]
  ) => string;

  (Module as any)._resolveFilename = function (
    request: string,
    parent: NodeJS.Module | null,
    ...rest: unknown[]
  ) {
    // 1. RN's platform-aware resolution — `Foo.android.{ts,tsx,js,jsx}`
    //    first for relative requires from inside RN.
    if (
      parent &&
      typeof parent.filename === "string" &&
      parent.filename.startsWith(RN_PREFIX) &&
      request.startsWith(".")
    ) {
      const stripped = request.replace(/\.(js|jsx|ts|tsx)$/, "");
      for (const ext of ANDROID_EXTENSIONS) {
        try {
          return originalResolve.call(this, stripped + ext, parent, ...rest);
        } catch {
          /* try next ext */
        }
      }
    }

    // 2. Real-app submodule resolution — handles tsconfig paths
    //    (`#/...`), explicit mocks, and falls back to harness's
    //    node_modules for npm-style imports. Consulted before the
    //    curated pack so an explicit real-app mock wins over a curated
    //    default for the same package.
    if (parent && typeof parent.filename === "string") {
      const ra = realAppOverrides(request, parent.filename, HARNESS_NODE_MODULES);
      if (ra) {
        try {
          return originalResolve.call(this, ra, parent, ...rest);
        } catch {
          /* fall through to default */
        }
      }
    }

    // 3. Curated default-mock pack (always on) — request-string match,
    //    importer-independent, for common third-party packages whose
    //    native side throws at import time under Node.
    const curated = curatedOverride(request);
    if (curated) {
      try {
        return originalResolve.call(this, curated, parent, ...rest);
      } catch {
        /* fall through to default */
      }
    }

    // 4. Default resolution. On failure, the opt-in catch-all routes a
    //    bare unresolvable import to the permissive proxy module so a
    //    real-app bundle keeps loading.
    try {
      return originalResolve.call(this, request, parent, ...rest);
    } catch (err) {
      const ca = catchAllOverride(request);
      if (ca) return originalResolve.call(this, ca, parent, ...rest);
      throw err;
    }
  };

  require("@babel/register")({
    presets: [require.resolve("@react-native/babel-preset")],
    only: TRANSFORM_ROOTS.map(
      (root) => new RegExp("^" + root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    ),
    extensions: [".js", ".jsx", ".ts", ".tsx"],
    cache: true,
  });
}
