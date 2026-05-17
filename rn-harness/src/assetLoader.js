// Plain-JS asset loader so both the .ts require hook (loaded inside
// Jest's transform pipeline) and the .js transformer module (loaded
// *outside* it, via Node's bare require) can consume the same code
// without depending on ts-node / ts-jest at transformer-load time.

const fs = require("fs");
const path = require("path");

/**
 * Read an image file from disk and build the source object an RN
 * <Image> would consume. Only the PNG header is parsed today — other
 * formats fall back to `width: 0, height: 0`, which the renderer's
 * existing intrinsic-size handling treats the same way Metro does
 * when an asset has no dimension metadata (the consumer's `style`
 * overrides the size).
 */
function loadAsset(filename) {
  const abs = path.resolve(filename);
  const buf = fs.readFileSync(abs);
  const dims = readImageDimensions(buf, abs);
  return {
    __packager_asset: true,
    uri: `file://${abs}`,
    width: dims.width,
    height: dims.height,
    scale: 1,
  };
}

function readImageDimensions(buf, filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return readPngDimensions(buf);
  // JPG/GIF/WEBP parsing is plausible but not strictly needed for the
  // first-target fixtures we ship — RN images set width/height in style
  // anyway. Add per-format parsers when a fixture needs them.
  return { width: 0, height: 0 };
}

function readPngDimensions(buf) {
  // PNG: 8-byte signature, then a 4-byte chunk-length, 4-byte chunk-type
  // ("IHDR"), then 4-byte width + 4-byte height (big-endian). The IHDR
  // chunk is always the first chunk per the PNG spec, so it starts at
  // byte 8 and width/height are at bytes 16 and 20.
  if (
    buf.length < 24 ||
    buf[0] !== 0x89 ||
    buf[1] !== 0x50 ||
    buf[2] !== 0x4e ||
    buf[3] !== 0x47
  ) {
    return { width: 0, height: 0 };
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

module.exports = { loadAsset };
