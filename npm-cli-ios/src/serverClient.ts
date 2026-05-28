export interface ServerClientOptions {
  baseUrl: string;
  apiKey: string;
}

export interface SubmittedRender {
  id: string;
  status: string;
}

export interface RenderRecordResponse {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  url?: string;
  width?: number;
  height?: number;
  scale?: number;
  warnings?: string[];
  error?: { code: string; message: string; status: number };
}

export class ServerClient {
  constructor(private readonly opts: ServerClientOptions) {}

  async submitRender(body: unknown): Promise<SubmittedRender> {
    const res = await this.fetch("/renders", { method: "POST", body: JSON.stringify(body) });
    return (await res.json()) as SubmittedRender;
  }

  async getRender(id: string): Promise<RenderRecordResponse> {
    const res = await this.fetch(`/renders/${id}`);
    return (await res.json()) as RenderRecordResponse;
  }

  async pollUntilSettled(
    id: string,
    opts: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<RenderRecordResponse> {
    const intervalMs = opts.intervalMs ?? 500;
    const timeoutMs = opts.timeoutMs ?? 60_000;
    const start = Date.now();
    for (;;) {
      const record = await this.getRender(id);
      if (record.status === "succeeded" || record.status === "failed") return record;
      if (Date.now() - start > timeoutMs) {
        throw new Error(`render ${id} did not settle within ${timeoutMs}ms`);
      }
      await sleep(intervalMs);
    }
  }

  async downloadPng(url: string): Promise<Buffer> {
    const res = await this.fetch(url, { absolute: url.startsWith("http") });
    return Buffer.from(await res.arrayBuffer());
  }

  async uploadAsset(
    zipPath: string,
  ): Promise<{ assetBundleId: string; expiresAt: string; sizeBytes: number }> {
    const { readFile } = await import("node:fs/promises");
    const body = await readFile(zipPath);
    const res = await this.fetch("/assets", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/zip" },
    });
    return (await res.json()) as { assetBundleId: string; expiresAt: string; sizeBytes: number };
  }

  async listAssets(): Promise<{
    assets: Array<{
      assetBundleId: string;
      uploadedAt: string;
      expiresAt: string;
      sizeBytes: number;
    }>;
  }> {
    const res = await this.fetch("/assets");
    return (await res.json()) as {
      assets: Array<{
        assetBundleId: string;
        uploadedAt: string;
        expiresAt: string;
        sizeBytes: number;
      }>;
    };
  }

  async deleteAsset(id: string): Promise<void> {
    await this.fetch(`/assets/${id}`, { method: "DELETE" });
  }

  private async fetch(
    path: string,
    init: RequestInit & { absolute?: boolean } = {},
  ): Promise<Response> {
    const url = init.absolute ? path : `${this.opts.baseUrl}${path}`;
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.opts.apiKey}`);
    const res = await fetch(url, { ...init, headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} ${url}: ${text}`);
    }
    return res;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
