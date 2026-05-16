import fs from "fs";
import path from "path";
import { renderFixture, renderFrames } from "./renderFixture";

const FIXTURES = [
  { name: "simpleView", path: "../fixtures/simpleView" },
  { name: "nestedViews", path: "../fixtures/nestedViews" },
  { name: "textAndImage", path: "../fixtures/textAndImage" },
  { name: "scrollView", path: "../fixtures/scrollView" },
  { name: "conditional", path: "../fixtures/conditional" },
  { name: "nestedTextSpans", path: "../fixtures/nestedTextSpans" },
  { name: "imageResizeModes", path: "../fixtures/imageResizeModes" },
  { name: "transformsAndEffects", path: "../fixtures/transformsAndEffects" },
  { name: "updateBadgeCount", path: "../fixtures/updateBadgeCount" },
  { name: "customFontText", path: "../fixtures/customFontText" },
  { name: "imageTintAndAsset", path: "../fixtures/imageTintAndAsset" },
] as const;

function main() {
  const outDir = path.resolve(__dirname, "..", "out");
  fs.mkdirSync(outDir, { recursive: true });

  for (const { name, path: modulePath } of FIXTURES) {
    const element = require(modulePath).default;
    const started = Date.now();
    // An array default export means a multi-frame fixture: each frame
    // is rendered into the same surface so the second and later
    // produce clone* update ops.
    const { surfaceId, instructions } = Array.isArray(element)
      ? renderFrames(element)
      : renderFixture(element);
    const elapsedMs = Date.now() - started;

    const outPath = path.join(outDir, `${name}.json`);
    const payload = { fixture: name, surfaceId, instructionCount: instructions.length, instructions };
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
    console.log(`[rn-harness] ${name}: ${instructions.length} instructions, ${elapsedMs} ms → ${path.relative(process.cwd(), outPath)}`);
  }
}

main();
