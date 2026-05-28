import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { Command } from "commander";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export function diffCommand(): Command {
  return new Command("diff")
    .description("Pixel-diff two PNGs (wraps pixelmatch)")
    .argument("<a.png>")
    .argument("<b.png>")
    .option("--threshold <ratio>", "max acceptable diff ratio", (v) => Number(v), 0.01)
    .option("--out <path>", "write a visual diff PNG to this path")
    .action(async (aPath: string, bPath: string, opts: { threshold: number; out?: string }) => {
      const [aBuf, bBuf] = await Promise.all([readFile(aPath), readFile(bPath)]);
      const a = PNG.sync.read(aBuf);
      const b = PNG.sync.read(bBuf);
      if (a.width !== b.width || a.height !== b.height) {
        process.stderr.write(
          `diff: dimension mismatch — ${aPath} is ${a.width}x${a.height}, ${bPath} is ${b.width}x${b.height}\n`,
        );
        process.exit(1);
      }
      const { width, height } = a;
      const total = width * height;
      const diffPng = opts.out ? new PNG({ width, height }) : undefined;
      const diffPixels = pixelmatch(a.data, b.data, diffPng?.data, width, height, {
        threshold: 0.1,
      });
      if (diffPng && opts.out) {
        await mkdir(dirname(opts.out), { recursive: true });
        await writeFile(opts.out, PNG.sync.write(diffPng));
      }
      const ratio = diffPixels / total;
      const pass = ratio <= opts.threshold;
      const fmtPct = (r: number) => `${(r * 100).toFixed(4)}%`;
      const fmtInt = (n: number) => n.toLocaleString("en-US");
      process.stdout.write(
        `diff: ${fmtInt(diffPixels)} / ${fmtInt(total)} pixels (${fmtPct(ratio)}) — ${pass ? "pass" : "fail"} (threshold ${fmtPct(opts.threshold)})\n`,
      );
      process.exit(pass ? 0 : 1);
    });
}
