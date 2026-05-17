// Jest counterpart to `assetRequireHook.ts`. Jest's transformer
// pipeline replaces Node's require.extensions, so the require-hook
// strategy used under plain Node doesn't apply here.
//
// Jest reads the file's content via the default loader (the `src`
// param is the raw file content as a UTF-8 string, which would
// corrupt binary PNG bytes); we ignore `src` and re-read the file
// ourselves via the underlying loadAsset helper.
//
// The output is the same CommonJS source object the require hook
// produces, so a fixture rendered under either runtime sees the
// identical asset descriptor.

const { loadAsset } = require("./assetLoader");
const fs = require("fs");

// Cache key honours filename + size + mtime of both the image and the
// loader module. Without the loader's mtime, edits to assetLoader.js
// (e.g. changing data: encoding to file:// or vice versa) wouldn't
// invalidate Jest's transform cache, leaving stale captures behind.
const loaderStat = fs.statSync(require.resolve("./assetLoader"));
const LOADER_VERSION = `${loaderStat.size}|${loaderStat.mtimeMs}`;

module.exports = {
  process(_src, filename) {
    const source = loadAsset(filename);
    return { code: `module.exports = ${JSON.stringify(source)};` };
  },
  getCacheKey(_src, filename) {
    const stat = fs.statSync(filename);
    return `${filename}|${stat.size}|${stat.mtimeMs}|loader:${LOADER_VERSION}`;
  },
};
