import fs from "fs";
import path from "path";
import { renderFixture, renderFrames } from "../src/renderFixture";

// Rendered in the same order as src/captureFixtures.ts so that Fabric's
// internal react-tag counter lines up with the committed goldens. If you add
// a new fixture, append it here and in the CLI in the same position, then
// regenerate goldens via `npm run capture`.
const FIXTURES = [
  { name: "simpleView", modulePath: "../fixtures/simpleView" },
  { name: "nestedViews", modulePath: "../fixtures/nestedViews" },
  { name: "textAndImage", modulePath: "../fixtures/textAndImage" },
  { name: "scrollView", modulePath: "../fixtures/scrollView" },
  { name: "conditional", modulePath: "../fixtures/conditional" },
  { name: "nestedTextSpans", modulePath: "../fixtures/nestedTextSpans" },
  { name: "imageResizeModes", modulePath: "../fixtures/imageResizeModes" },
  { name: "transformsAndEffects", modulePath: "../fixtures/transformsAndEffects" },
  { name: "updateBadgeCount", modulePath: "../fixtures/updateBadgeCount" },
  { name: "customFontText", modulePath: "../fixtures/customFontText" },
  { name: "imageTintAndAsset", modulePath: "../fixtures/imageTintAndAsset" },
];

describe("Fabric mount instruction capture", () => {
  for (const { name, modulePath } of FIXTURES) {
    test(`${name} matches golden`, () => {
      const element = require(modulePath).default;
      const { surfaceId, instructions } = Array.isArray(element)
        ? renderFrames(element)
        : renderFixture(element);

      const goldenPath = path.resolve(__dirname, "..", "out", `${name}.json`);
      const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"));

      expect({ fixture: name, surfaceId, instructionCount: instructions.length, instructions }).toEqual({
        fixture: golden.fixture,
        surfaceId: golden.surfaceId,
        instructionCount: golden.instructionCount,
        instructions: golden.instructions,
      });
    });
  }
});
