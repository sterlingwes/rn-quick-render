// Shared default-mock resolution table. Consumed by BOTH resolver
// worlds — `src/babelRegister.ts` (plain Node, via Module._resolveFilename)
// and `src/jestRnResolver.js` (Jest) — so a fixture resolves a curated
// third-party package to the same mock in either runtime.
//
// This file is plain CommonJS on purpose: `jestRnResolver.js` runs before
// ts-jest is loaded and can't `import` a `.ts` module, which is exactly
// the duplication the comment in that file warns about. Keeping the table
// here lets both sides `require` one source of truth.
//
// Two layers:
//   1. Curated pack (always on): a request-string → mock-file map for
//      common RN-ecosystem packages whose native side throws at import
//      time under Node. Importer-independent — matches on the request
//      string alone, unlike realAppResolver which only fires inside a
//      target submodule root.
//   2. Catch-all (opt-in via RN_HARNESS_AUTOMOCK_UNRESOLVED): any
//      otherwise-unresolvable bare import falls back to a permissive
//      proxy module so a real-app bundle keeps loading.
//
// Precedence note: an explicit real-app `mocks` entry
// (realAppResolver.ts) should still win over a curated default — an app
// author who hand-wrote a better stub keeps it. That holds today because
// curated keys are npm package names while real-app mock keys are `#/…`
// / `@scope/…` aliases, and both resolvers consult realAppOverrides
// before the curated step. A future real-app mock that wants to override
// a curated package must add an explicit entry to its target's `mocks`.

const path = require("path");
const Module = require("module");

const DIR = __dirname;

// Curated default mocks keyed by exact package request string. Subpath
// imports (e.g. "react-native-svg/css") route to the same file via the
// prefix check in `curatedOverride`.
const CURATED_MOCKS = {
  "react-native-reanimated": path.join(DIR, "reanimated.tsx"),
  "react-native-gesture-handler": path.join(DIR, "gestureHandler.tsx"),
  "react-native-svg": path.join(DIR, "svg.tsx"),
  "react-native-screens": path.join(DIR, "screens.tsx"),
  "react-native-safe-area-context": path.join(DIR, "safeAreaContext.tsx"),
  "@react-native-async-storage/async-storage": path.join(DIR, "asyncStorage.ts"),
  "@react-native-community/netinfo": path.join(DIR, "netInfo.ts"),
  "lottie-react-native": path.join(DIR, "lottie.tsx"),
  "react-native-fast-image": path.join(DIR, "fastImage.tsx"),
};

const CATCHALL_MODULE = path.join(DIR, "catchAllModule.tsx");

/** Absolute path to the curated mock for `request`, or null. */
function curatedOverride(request) {
  if (Object.prototype.hasOwnProperty.call(CURATED_MOCKS, request)) {
    return CURATED_MOCKS[request];
  }
  for (const pkg of Object.keys(CURATED_MOCKS)) {
    if (request.startsWith(pkg + "/")) return CURATED_MOCKS[pkg];
  }
  return null;
}

function catchAllEnabled() {
  const v = process.env.RN_HARNESS_AUTOMOCK_UNRESOLVED;
  return v === "1" || v === "true";
}

const BUILTINS = new Set(Module.builtinModules);

// True for bare npm-style specifiers: not relative, not absolute, not a
// node builtin. Scoped names ("@scope/pkg") count as bare.
function isBareImport(request) {
  if (!request || request.startsWith(".") || request.startsWith("/")) return false;
  if (request.startsWith("node:")) return false;
  const top = request.startsWith("@")
    ? request.split("/").slice(0, 2).join("/")
    : request.split("/")[0];
  return !BUILTINS.has(top);
}

/**
 * Catch-all target for `request` when the opt-in flag is set and the
 * request is a bare import; null otherwise. Callers apply this only
 * AFTER default resolution has failed, so installed packages are never
 * shadowed.
 */
function catchAllOverride(request) {
  if (!catchAllEnabled()) return null;
  if (!isBareImport(request)) return null;
  return CATCHALL_MODULE;
}

module.exports = {
  CURATED_MOCKS,
  CATCHALL_MODULE,
  curatedOverride,
  catchAllEnabled,
  isBareImport,
  catchAllOverride,
};
