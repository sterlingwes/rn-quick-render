import fs from "fs";
import path from "path";
import { computeLayout } from "../src/computeLayout";
import type { MountInstruction } from "../src/types";

function loadInstructions(name: string): MountInstruction[] {
  const p = path.resolve(__dirname, "..", "out", `${name}.json`);
  return (JSON.parse(fs.readFileSync(p, "utf8")) as { instructions: MountInstruction[] }).instructions;
}

describe("computeLayout over captured mount instructions", () => {
  test("simpleView respects explicit width/height", async () => {
    const ins = loadInstructions("simpleView");
    const { rects, roots } = await computeLayout(ins);
    expect(roots).toEqual([1]);
    expect(rects[1]).toEqual({ left: 0, top: 0, width: 320, height: 120 });
  });

  test("nestedViews stacks rows with padding and swatch marginEnd", async () => {
    const ins = loadInstructions("nestedViews");
    const { rects, roots } = await computeLayout(ins);
    expect(roots).toEqual([9]);
    // Outer column takes viewport width; height = 2 rows × 48 dp + 2 × 16 dp padding.
    expect(rects[9]).toEqual({ left: 0, top: 0, width: 411, height: 128 });
    // Row 4 is at the outer's top padding.
    expect(rects[4]).toEqual({ left: 16, top: 16, width: 379, height: 48 });
    // Row 8 stacks directly below.
    expect(rects[8]).toEqual({ left: 16, top: 64, width: 379, height: 48 });
    // First swatch inside row 4 sits at its parent's padding (8, 8).
    expect(rects[1]).toEqual({ left: 8, top: 8, width: 32, height: 32 });
    // Second swatch: prev swatch right edge (8+32) + marginEnd 8 = 48.
    expect(rects[2]).toEqual({ left: 48, top: 8, width: 32, height: 32 });
    expect(rects[3]).toEqual({ left: 88, top: 8, width: 32, height: 32 });
  });

  test("computeLayout honours a custom viewport", async () => {
    const ins = loadInstructions("simpleView");
    const { rects, viewport } = await computeLayout(ins, { width: 200, height: 200 });
    expect(viewport).toEqual({ width: 200, height: 200 });
    // Root width/height are explicit; viewport only affects descendants that ask for %s.
    expect(rects[1]).toEqual({ left: 0, top: 0, width: 320, height: 120 });
  });
});
