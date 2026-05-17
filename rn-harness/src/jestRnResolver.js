// Jest resolver that does two things for files inside
// `node_modules/react-native`:
//
//   1. Mimics Metro's platform-aware resolution — tries `Foo.android.js`
//      before `Foo.js` for relative requires. RN ships a dispatching
//      `Foo.js` that self-imports `./Foo` expecting Metro to pick the
//      platform-specific file; plain Jest can't, so we do.
//
//   2. Redirects post-resolution paths for the bridge surfaces
//      (`NativeModules`, `TurboModuleRegistry`) to our local stubs.
//      `moduleNameMapper` operates on the request string before
//      resolution and so misses relative requires from inside RN —
//      `../../Libraries/TurboModule/TurboModuleRegistry` never matches
//      `^react-native/...`. Catching it post-resolution is the only
//      reliable place.

const path = require("path");

const RN_ROOT = path.dirname(require.resolve("react-native/package.json"));
const RN_PREFIX = RN_ROOT + path.sep;
const ANDROID_EXTENSIONS = [".android.ts", ".android.tsx", ".android.js", ".android.jsx"];

const REDIRECTS = new Map([
  [
    path.join(RN_ROOT, "Libraries", "BatchedBridge", "NativeModules.js"),
    path.resolve(__dirname, "nativeModulesJestStub.ts"),
  ],
  [
    path.join(RN_ROOT, "Libraries", "TurboModule", "TurboModuleRegistry.js"),
    path.resolve(__dirname, "turboModuleRegistryJestStub.ts"),
  ],
]);

function tryAndroidVariants(request, options) {
  const { defaultResolver } = options;
  const stripped = request.replace(/\.(js|jsx|ts|tsx)$/, "");
  for (const ext of ANDROID_EXTENSIONS) {
    try {
      return defaultResolver(stripped + ext, options);
    } catch {
      // try next
    }
  }
  return null;
}

module.exports = (request, options) => {
  const { defaultResolver, basedir } = options;

  // Step 1: platform-aware resolution for relative requires from inside RN.
  let resolved;
  if (basedir && basedir.startsWith(RN_PREFIX) && request.startsWith(".")) {
    resolved = tryAndroidVariants(request, options);
  }
  if (resolved == null) {
    resolved = defaultResolver(request, options);
  }

  // Step 2: redirect to our Jest-only stub for the bridge surfaces.
  const redirected = REDIRECTS.get(resolved);
  return redirected ?? resolved;
};
