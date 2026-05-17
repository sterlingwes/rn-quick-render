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
  { name: "realRnHelloWorld", modulePath: "../fixtures/realRnHelloWorld" },
  { name: "realRnImageAsset", modulePath: "../fixtures/realRnImageAsset" },
  { name: "realRnRegisteredApp", modulePath: "../fixtures/realRnRegisteredApp" },
  { name: "blueskyDivider", modulePath: "../fixtures/realApp/bluesky-divider" },
  { name: "blueskyAdmonition", modulePath: "../fixtures/realApp/bluesky-admonition" },
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

      // Round-trip the fresh capture through JSON the same way the
      // golden was serialized: JSON.stringify drops `undefined` and
      // emits `null` for undefined array entries. Without this, a
      // captured prop containing `undefined` (e.g. RN's nested
      // `style: [a, b, c, undefined]` from a spread default) would
      // deep-equal-fail against the on-disk golden's `null`.
      const fresh = JSON.parse(
        JSON.stringify({
          fixture: name,
          surfaceId,
          instructionCount: instructions.length,
          instructions,
        }),
      );

      expect(fresh).toEqual({
        fixture: golden.fixture,
        surfaceId: golden.surfaceId,
        instructionCount: golden.instructionCount,
        instructions: golden.instructions,
      });
    });
  }
});
