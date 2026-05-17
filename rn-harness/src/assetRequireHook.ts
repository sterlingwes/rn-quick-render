// Asset-as-source require hook for plain-Node fixtures (the
// `npm run capture` path). Jest routes image files through
// `jestAssetTransformer.js` instead via its `transform` map; both
// produce identical CommonJS exports so either runtime — plain Node
// CLI or Jest — sees the same source object.
//
// The loader itself lives in `assetLoader.js` (plain JS) so the Jest
// transformer can require it without needing ts-jest, which doesn't
// run on transformer files themselves.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadAsset } = require("./assetLoader") as {
  loadAsset: (filename: string) => AssetSource;
};

export interface AssetSource {
  __packager_asset: true;
  uri: string;
  width: number;
  height: number;
  scale: number;
}

/**
 * Install `require.extensions['.png']` (and friends) so plain-Node
 * fixtures can do `require('./assets/foo.png')` and get back the same
 * source object the Jest transformer produces. Idempotent — safe to
 * call multiple times.
 *
 * Skipped under Jest, which routes image files through
 * `jestAssetTransformer.js` instead via its `transform` map.
 */
export function installAssetRequireHook(): void {
  if (typeof process !== "undefined" && process.env.JEST_WORKER_ID !== undefined) return;
  if ((installAssetRequireHook as any)._installed) return;
  (installAssetRequireHook as any)._installed = true;

  const extensions = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
  for (const ext of extensions) {
    (require.extensions as any)[ext] = (m: NodeJS.Module, filename: string) => {
      (m as any).exports = loadAsset(filename);
    };
  }
}

export { loadAsset };
