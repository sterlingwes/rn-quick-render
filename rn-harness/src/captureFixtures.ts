import fs from "fs";
import path from "path";
import { loadRealRn, setColorScheme } from "./loadRealRn";
import { isConcurrentFixture, renderConcurrent, renderFixture, renderFrames } from "./renderFixture";

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
  { name: "realRnHelloWorld", path: "../fixtures/realRnHelloWorld" },
  { name: "realRnImageAsset", path: "../fixtures/realRnImageAsset" },
  { name: "realRnRegisteredApp", path: "../fixtures/realRnRegisteredApp" },
  { name: "blueskyDivider", path: "../fixtures/realApp/bluesky-divider" },
  { name: "blueskyAdmonition", path: "../fixtures/realApp/bluesky-admonition" },
  { name: "blueskyPasswordUpdated", path: "../fixtures/realApp/bluesky-password-updated" },
  { name: "blueskyOnboardingInterests", path: "../fixtures/realApp/bluesky-onboarding-interests" },
  { name: "suspendedText", path: "../fixtures/suspendedText" },
] as const;

// Fixtures we also capture under non-default platform settings, so
// the matrix renderer tests have per-variant mount-instruction
// streams to render against. Today: theme variants captured under
// `useColorScheme()='dark'`. The default (light) capture is always
// written without a suffix so the existing per-fixture tests keep
// reading the same path.
const THEMED_FIXTURES = new Set<string>([
  "blueskyOnboardingInterests",
]);

const EXTRA_THEME_VARIANTS = [
  { suffix: "__dark", scheme: "dark" as const },
];

async function main() {
  const outDir = path.resolve(__dirname, "..", "out");
  fs.mkdirSync(outDir, { recursive: true });

  // Bootstrap real RN once so subsequent `setColorScheme()` calls have
  // the module to monkey-patch. Idempotent — each fixture's
  // `loadRealRn()` call no-ops once the runtime is cached on
  // globalThis.
  loadRealRn();

  for (const { name, path: modulePath } of FIXTURES) {
    // Default light capture — every fixture, no suffix.
    setColorScheme("light");
    await captureOnce(name, "", modulePath, outDir);

    // Extra per-theme captures for matrix-targeted fixtures.
    if (THEMED_FIXTURES.has(name)) {
      for (const variant of EXTRA_THEME_VARIANTS) {
        setColorScheme(variant.scheme);
        await captureOnce(name, variant.suffix, modulePath, outDir);
      }
      setColorScheme("light");
    }
  }
}

async function captureOnce(name: string, suffix: string, modulePath: string, outDir: string) {
  // `require` caches the fixture's element on first call; subsequent
  // calls within the same process return the cached value. Theme
  // variants re-render that cached element under a different
  // `useColorScheme()` value, which propagates to the bsky alf mock's
  // `useTheme()` during render.
  const element = require(modulePath).default;
  const started = Date.now();
  // Dispatch by fixture shape: concurrent marker → renderConcurrent
  // (async, pumps the scheduler); plain array → multi-frame
  // renderFrames; single element → renderFixture.
  const { surfaceId, instructions } = isConcurrentFixture(element)
    ? await renderConcurrent(element)
    : Array.isArray(element)
      ? renderFrames(element)
      : renderFixture(element);
  const elapsedMs = Date.now() - started;

  const outPath = path.join(outDir, `${name}${suffix}.json`);
  const payload = { fixture: name + suffix, surfaceId, instructionCount: instructions.length, instructions };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
  console.log(`[rn-harness] ${name}${suffix}: ${instructions.length} instructions, ${elapsedMs} ms → ${path.relative(process.cwd(), outPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
