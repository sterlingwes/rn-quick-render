// Jest resolver that handles three resolution patterns Metro / Babel
// take care of in a normal RN setup but Jest doesn't:
//
//   1. Platform-aware resolution inside `node_modules/react-native` —
//      try `Foo.android.{ts,tsx,js,jsx}` before `Foo.{...}` for
//      relative requires. RN ships a dispatching `Foo.js` that
//      self-imports `./Foo` expecting Metro to pick the platform-
//      specific file.
//
//   2. Post-resolution stub redirects for the bridge surfaces
//      (`NativeModules`, `TurboModuleRegistry`). `moduleNameMapper`
//      operates on the request string before resolution and so
//      misses relative requires from inside RN —
//      `../../Libraries/TurboModule/TurboModuleRegistry` never
//      matches `^react-native/...`.
//
//   3. Real-app submodule resolution — `#/...` tsconfig path aliases,
//      explicit mocks for heavy design-system / state modules, and
//      npm-style fallback to the harness's node_modules for imports
//      whose target isn't installed inside the submodule.
//
// Mirrors `src/babelRegister.ts` and `src/realAppResolver.ts` so a
// fixture targeting a submodule renders identically under both
// runtimes.

const path = require("path");
const fs = require("fs");

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

const HARNESS_NODE_MODULES = path.resolve(__dirname, "..", "node_modules");

// Load real-app target table. The .ts file is reachable here because
// Jest's resolver is plain Node and we require the compiled .ts via
// ts-jest's hook — but ts-jest hasn't loaded yet at this point. So
// we duplicate the target list inline rather than importing it. Keep
// in sync with src/realAppResolver.ts; if this grows, hoist to a
// JSON file consumed by both.
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BSKY_MOCKS = path.join(__dirname, "realApp", "blueskyMocks");
const REAL_APP_TARGETS = [
  {
    root: path.join(REPO_ROOT, "third_party", "bluesky-social-app"),
    srcRoot: path.join(REPO_ROOT, "third_party", "bluesky-social-app", "src"),
    mocks: {
      "#/alf": path.join(BSKY_MOCKS, "alf.ts"),
      "#/components/Typography": path.join(BSKY_MOCKS, "typography.tsx"),
      "#/components/Button": path.join(BSKY_MOCKS, "button.tsx"),
      "#/components/icons/CircleInfo": path.join(BSKY_MOCKS, "icons.tsx"),
      "#/components/icons/CircleX": path.join(BSKY_MOCKS, "icons.tsx"),
      "#/components/icons/Warning": path.join(BSKY_MOCKS, "icons.tsx"),
      "./icons/Emoji": path.join(BSKY_MOCKS, "icons.tsx"),
    },
  },
];

const EXT_CANDIDATES = [".ts", ".tsx", ".js", ".jsx"];
const INDEX_CANDIDATES = EXT_CANDIDATES.map((e) => "index" + e);

function resolveSubpath(base, subpath) {
  for (const ext of EXT_CANDIDATES) {
    const c = path.join(base, subpath + ext);
    if (fs.existsSync(c)) return c;
  }
  for (const idx of INDEX_CANDIDATES) {
    const c = path.join(base, subpath, idx);
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function realAppOverride(request, basedir) {
  const target = REAL_APP_TARGETS.find(
    (t) => basedir && (basedir === t.root || basedir.startsWith(t.root + path.sep)),
  );
  if (!target) return null;
  if (target.mocks[request]) return target.mocks[request];
  if (request.startsWith("#/")) return resolveSubpath(target.srcRoot, request.slice(2));
  if (request.startsWith(".") || request.startsWith("/")) return null;
  try {
    return require.resolve(request, { paths: [HARNESS_NODE_MODULES] });
  } catch {
    return null;
  }
}

function tryAndroidVariants(request, options) {
  const { defaultResolver } = options;
  const stripped = request.replace(/\.(js|jsx|ts|tsx)$/, "");
  for (const ext of ANDROID_EXTENSIONS) {
    try {
      return defaultResolver(stripped + ext, options);
    } catch {
      /* try next */
    }
  }
  return null;
}

module.exports = (request, options) => {
  const { defaultResolver, basedir } = options;

  // Step 1: real-app submodule overrides. These need to win before
  // anything else — mocked design-system imports must NOT fall
  // through to a real file under the submodule.
  const raOverride = realAppOverride(request, basedir);
  if (raOverride != null) return raOverride;

  // Step 2: platform-aware resolution for relative requires inside RN.
  let resolved;
  if (basedir && basedir.startsWith(RN_PREFIX) && request.startsWith(".")) {
    resolved = tryAndroidVariants(request, options);
  }
  if (resolved == null) {
    resolved = defaultResolver(request, options);
  }

  // Step 3: post-resolution stub redirects for the bridge surfaces.
  const redirected = REDIRECTS.get(resolved);
  return redirected ?? resolved;
};
