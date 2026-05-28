import { Command } from "commander";

import { addConnOptions, makeClient, type ConnOpts } from "./render.js";

interface AssetListItem {
  assetBundleId: string;
  uploadedAt: string;
  expiresAt: string;
  sizeBytes: number;
}

export function assetsCommand(): Command {
  const root = new Command("assets").description(
    "Manage asset bundles (zip of fonts + images) for a namespace",
  );

  root.addCommand(
    addConnOptions(
      new Command("upload")
        .description("Upload an asset bundle")
        .argument("<bundle.zip>", "path to bundle zip"),
    ).action(async (bundlePath: string, opts: ConnOpts) => {
      const client = makeClient(opts);
      const out = await client.uploadAsset(bundlePath);
      process.stdout.write(
        `${out.assetBundleId} (${out.sizeBytes} bytes, expires ${out.expiresAt})\n`,
      );
    }),
  );

  root.addCommand(
    addConnOptions(new Command("list").description("List asset bundles in this namespace")).action(
      async (opts: ConnOpts) => {
        const client = makeClient(opts);
        const { assets } = await client.listAssets();
        if (assets.length === 0) {
          process.stdout.write("(no asset bundles)\n");
          return;
        }
        for (const a of assets as AssetListItem[]) {
          process.stdout.write(
            `${a.assetBundleId}\t${a.sizeBytes}B\tuploaded=${a.uploadedAt}\texpires=${a.expiresAt}\n`,
          );
        }
      },
    ),
  );

  root.addCommand(
    addConnOptions(
      new Command("delete").description("Delete an asset bundle by id").argument("<assetBundleId>"),
    ).action(async (id: string, opts: ConnOpts) => {
      const client = makeClient(opts);
      await client.deleteAsset(id);
      process.stdout.write(`deleted ${id}\n`);
    }),
  );

  return root;
}
