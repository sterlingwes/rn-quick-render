// Module-resolution rules for "real app" submodules under
// `third_party/<target>/`. Shared by `babelRegister` (plain Node) and
// `jestRnResolver.js` (Jest) so a fixture targeting a submodule
// component renders identically in both runtimes.
//
// Each target gets a `RealAppTarget` describing:
//   - root          — absolute path to the submodule
//   - srcRoot       — where `#/...` tsconfig aliases point to
//   - mocks         — `import path → absolute mock file`. Anything in
//                     here wins over real submodule files. Used to
//                     short-circuit heavy design-system / state /
//                     network modules with hand-written stubs.
//
// The resolver intercepts only requests originating *from inside* a
// target's `root`. Requests from harness / RN source / test files
// fall through to default resolution unchanged.

import fs from "fs";
import path from "path";

export interface RealAppTarget {
  /** Root directory of the submodule. */
  root: string;
  /** Where `#/...` tsconfig path aliases resolve to (typically `<root>/src`). */
  srcRoot: string;
  /** Per-target import overrides keyed by the request string. */
  mocks: Record<string, string>;
}

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const HARNESS_ROOT = path.resolve(__dirname, "..");

export const REAL_APP_TARGETS: RealAppTarget[] = [
  {
    root: path.join(REPO_ROOT, "third_party", "bluesky-social-app"),
    srcRoot: path.join(REPO_ROOT, "third_party", "bluesky-social-app", "src"),
    mocks: {
      // Bluesky's design system. Real alf pulls in @bsky.app/alf (a
      // private package) + a few thousand lines of style atoms,
      // themes, and platform helpers. Stub it out so individual
      // components render without standing up the whole stack.
      "#/alf": path.join(HARNESS_ROOT, "src", "realApp", "blueskyMocks", "alf.ts"),
    },
  },
];

export function realAppResolverPaths(): RealAppTarget[] {
  return REAL_APP_TARGETS.filter((t) => fs.existsSync(t.root));
}

const EXT_CANDIDATES = [".ts", ".tsx", ".js", ".jsx"];
const INDEX_CANDIDATES = EXT_CANDIDATES.map((e) => "index" + e);

function resolveSubpath(base: string, subpath: string): string | null {
  // Try `<base>/<subpath>.{ts,tsx,js,jsx}` then `<base>/<subpath>/index.{...}`.
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

/**
 * Given a `request` string and the absolute `filename` of its
 * importer, return an absolute path to the file the request should
 * resolve to — or `null` to let default resolution proceed.
 *
 * `harnessNodeModules` is `<harness>/node_modules`. Used as the
 * fallback for npm-style imports from inside a target submodule
 * whose own `node_modules` we don't install.
 */
export function realAppOverrides(
  request: string,
  fromFilename: string,
  harnessNodeModules: string,
): string | null {
  const target = REAL_APP_TARGETS.find((t) =>
    fromFilename.startsWith(t.root + path.sep) || fromFilename === t.root,
  );
  if (!target) return null;

  // 1. Explicit mocks win first.
  if (target.mocks[request]) return target.mocks[request];

  // 2. `#/...` tsconfig path alias → submodule src root.
  if (request.startsWith("#/")) {
    return resolveSubpath(target.srcRoot, request.slice(2));
  }

  // 3. Relative paths fall through to Node's default resolver — it
  //    works inside the submodule because the files are real on
  //    disk. No intervention needed.
  if (request.startsWith(".") || request.startsWith("/")) return null;

  // 4. npm-style imports — the submodule won't have node_modules
  //    installed, so redirect to the harness's. This is the path
  //    `react-native` / `react` / `@react-native/*` hits when
  //    something inside the submodule imports them.
  try {
    return require.resolve(request, { paths: [harnessNodeModules] });
  } catch {
    return null;
  }
}
