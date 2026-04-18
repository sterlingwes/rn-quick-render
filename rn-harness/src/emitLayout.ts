import fs from "fs";
import path from "path";
import { computeLayout } from "./computeLayout";
import type { MountInstruction } from "./types";

const FIXTURES = ["simpleView", "nestedViews", "textAndImage", "scrollView", "conditional"] as const;

async function main() {
  const outDir = path.resolve(__dirname, "..", "out");

  for (const name of FIXTURES) {
    const inputPath = path.join(outDir, `${name}.json`);
    const raw = JSON.parse(fs.readFileSync(inputPath, "utf8")) as {
      fixture: string;
      surfaceId: number;
      instructions: MountInstruction[];
    };

    const { viewport, rects, roots } = await computeLayout(raw.instructions);

    const payload = {
      fixture: raw.fixture,
      surfaceId: raw.surfaceId,
      viewport,
      roots,
      rects,
    };

    const outPath = path.join(outDir, `${name}.layout.json`);
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
    const rootRects = roots.map((r) => rects[r]).filter(Boolean);
    const total = rootRects.reduce((acc, r) => ({ w: Math.max(acc.w, r.width), h: acc.h + r.height }), { w: 0, h: 0 });
    console.log(`[rn-harness] ${name}: viewport ${viewport.width}x${viewport.height} dp, root bounds ~${total.w}x${total.h} dp → ${path.relative(process.cwd(), outPath)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
