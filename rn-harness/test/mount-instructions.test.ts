import fs from "fs";
import path from "path";
import { loadRealRn, setColorScheme } from "../src/loadRealRn";
import { isConcurrentFixture, renderConcurrent, renderFixture, renderFrames } from "../src/renderFixture";

// Rendered in the same order as src/captureFixtures.ts so that Fabric's
// internal react-tag counter lines up with the committed goldens. If you
// add a new fixture, append it here and in the CLI in the same position,
// then regenerate goldens via `npm run capture`.
//
// `scheme` selects the platform color-scheme override applied before
// rendering. The default is "light" with an empty `suffix` (the existing
// goldens). Themed matrix fixtures get extra entries with `scheme: "dark"`
// and `suffix: "__dark"` so the captured stream encodes the dark palette.
type Variant = { name: string; modulePath: string; scheme: "light" | "dark" | null; suffix: string };

const FIXTURES: Variant[] = [
  { name: "simpleView", modulePath: "../fixtures/simpleView", scheme: "light", suffix: "" },
  { name: "nestedViews", modulePath: "../fixtures/nestedViews", scheme: "light", suffix: "" },
  { name: "textAndImage", modulePath: "../fixtures/textAndImage", scheme: "light", suffix: "" },
  { name: "scrollView", modulePath: "../fixtures/scrollView", scheme: "light", suffix: "" },
  { name: "conditional", modulePath: "../fixtures/conditional", scheme: "light", suffix: "" },
  { name: "nestedTextSpans", modulePath: "../fixtures/nestedTextSpans", scheme: "light", suffix: "" },
  { name: "imageResizeModes", modulePath: "../fixtures/imageResizeModes", scheme: "light", suffix: "" },
  { name: "transformsAndEffects", modulePath: "../fixtures/transformsAndEffects", scheme: "light", suffix: "" },
  { name: "updateBadgeCount", modulePath: "../fixtures/updateBadgeCount", scheme: "light", suffix: "" },
  { name: "customFontText", modulePath: "../fixtures/customFontText", scheme: "light", suffix: "" },
  { name: "imageTintAndAsset", modulePath: "../fixtures/imageTintAndAsset", scheme: "light", suffix: "" },
  { name: "realRnHelloWorld", modulePath: "../fixtures/realRnHelloWorld", scheme: "light", suffix: "" },
  { name: "realRnImageAsset", modulePath: "../fixtures/realRnImageAsset", scheme: "light", suffix: "" },
  { name: "realRnRegisteredApp", modulePath: "../fixtures/realRnRegisteredApp", scheme: "light", suffix: "" },
  { name: "blueskyDivider", modulePath: "../fixtures/realApp/bluesky-divider", scheme: "light", suffix: "" },
  { name: "blueskyAdmonition", modulePath: "../fixtures/realApp/bluesky-admonition", scheme: "light", suffix: "" },
  { name: "blueskyPasswordUpdated", modulePath: "../fixtures/realApp/bluesky-password-updated", scheme: "light", suffix: "" },
  { name: "blueskyOnboardingInterests", modulePath: "../fixtures/realApp/bluesky-onboarding-interests", scheme: "light", suffix: "" },
  { name: "blueskyOnboardingInterests", modulePath: "../fixtures/realApp/bluesky-onboarding-interests", scheme: "dark", suffix: "__dark" },
  { name: "suspendedText", modulePath: "../fixtures/suspendedText", scheme: "light", suffix: "" },
  { name: "reanimatedSvg", modulePath: "../fixtures/defaultMocks/reanimatedSvg", scheme: "light", suffix: "" },
];

// Load RN once up front so `setColorScheme()` has the module to monkey-
// patch on the first themed fixture. Idempotent — fixtures' own
// `loadRealRn()` calls no-op once the runtime is cached on globalThis.
beforeAll(() => {
  loadRealRn();
});

describe("Fabric mount instruction capture", () => {
  for (const { name, modulePath, scheme, suffix } of FIXTURES) {
    const fullName = `${name}${suffix}`;
    test(`${fullName} matches golden`, async () => {
      setColorScheme(scheme);
      const element = require(modulePath).default;
      const { surfaceId, instructions } = isConcurrentFixture(element)
        ? await renderConcurrent(element)
        : Array.isArray(element)
          ? renderFrames(element)
          : renderFixture(element);

      const goldenPath = path.resolve(__dirname, "..", "out", `${fullName}.json`);
      const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"));

      // Round-trip the fresh capture through JSON the same way the
      // golden was serialized: JSON.stringify drops `undefined` and
      // emits `null` for undefined array entries. Without this, a
      // captured prop containing `undefined` (e.g. RN's nested
      // `style: [a, b, c, undefined]` from a spread default) would
      // deep-equal-fail against the on-disk golden's `null`.
      const fresh = JSON.parse(
        JSON.stringify({
          fixture: fullName,
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
