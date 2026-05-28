// Posts a render to a running server and waits for the PNG. Mirrors what
// scripts/smoke.mjs does, but typed and reusable from the fidelity suite.

export interface RenderRequestBody {
  fixture?: string;
  surfaceId: number;
  instructions: unknown[];
  rnVersion: string;
  device: { name: string; osVersion: string };
  appearance?: "light" | "dark";
  locale?: string;
  fontScale?: number;
}

export interface RenderRecord {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  url?: string;
  error?: string | { code?: string; message?: string; status?: number };
  warnings?: string[];
  timing?: { queueMs: number; replayMs: number; captureMs: number };
}

function describeError(err: RenderRecord["error"]): string {
  if (!err) return "<none>";
  if (typeof err === "string") return err;
  return err.message ?? err.code ?? JSON.stringify(err);
}

export interface RenderResult {
  png: Buffer;
  record: RenderRecord;
}

export async function render(opts: {
  serverUrl: string;
  apiKey: string;
  body: RenderRequestBody;
  pollMs?: number;
  timeoutMs?: number;
}): Promise<RenderResult> {
  const { serverUrl, apiKey, body } = opts;
  const headers = { Authorization: `Bearer ${apiKey}` };

  const submitRes = await fetch(`${serverUrl}/renders`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!submitRes.ok) {
    throw new Error(`POST /renders ${submitRes.status}: ${await submitRes.text()}`);
  }
  const submitted = (await submitRes.json()) as { id: string };

  const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
  const pollMs = opts.pollMs ?? 500;
  let record: RenderRecord | undefined;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    const res = await fetch(`${serverUrl}/renders/${submitted.id}`, { headers });
    if (!res.ok) throw new Error(`GET /renders/${submitted.id} ${res.status}`);
    record = (await res.json()) as RenderRecord;
    if (record.status === "succeeded" || record.status === "failed") break;
  }
  if (!record || record.status !== "succeeded") {
    throw new Error(
      `render ${submitted.id} did not succeed (status=${record?.status}, error=${describeError(record?.error)})`,
    );
  }
  if (!record.url) throw new Error(`render ${submitted.id} missing url`);

  const pngRes = await fetch(record.url, { headers });
  if (!pngRes.ok) throw new Error(`GET PNG ${pngRes.status}`);
  const png = Buffer.from(await pngRes.arrayBuffer());
  return { png, record };
}
