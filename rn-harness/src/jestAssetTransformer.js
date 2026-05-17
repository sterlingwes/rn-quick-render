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

module.exports = {
  process(_src, filename) {
    const source = loadAsset(filename);
    return { code: `module.exports = ${JSON.stringify(source)};` };
  },
  // Cache key honours filename + size + mtime so a re-saved PNG
  // invalidates the cached transform. Cheap and avoids "old golden
  // after asset swap" surprises.
  getCacheKey(_src, filename) {
    const fs = require("fs");
    const stat = fs.statSync(filename);
    return `${filename}|${stat.size}|${stat.mtimeMs}`;
  },
};
