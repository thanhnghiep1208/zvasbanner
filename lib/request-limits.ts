/**
 * Per-instance sliding window rate limiter. For distributed enforcement
 * across serverless instances, replace with Redis/KV.
 */
export function createRateLimiter(maxPerWindow: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return function checkRateLimit(key: string): boolean {
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (hits.get(key) ?? []).filter((t) => t > cutoff);
    if (timestamps.length >= maxPerWindow) {
      hits.set(key, timestamps);
      return false;
    }
    timestamps.push(now);
    hits.set(key, timestamps);
    return true;
  };
}

export type LimitedJsonResult =
  | { ok: true; body: unknown }
  | { ok: false; status: number; error: string };

/**
 * Reads and JSON-parses a request body while enforcing a hard byte cap on
 * the actual bytes read — unlike a bare Content-Length check, this can't be
 * bypassed by a client that omits the header or uses chunked transfer.
 */
export async function readJsonWithSizeLimit(
  req: Request,
  maxBytes: number
): Promise<LimitedJsonResult> {
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    return { ok: false, status: 413, error: "Request payload quá lớn." };
  }

  const reader = req.body?.getReader();
  if (!reader) {
    try {
      return { ok: true, body: await req.json() };
    } catch {
      return { ok: false, status: 400, error: "Body JSON không hợp lệ." };
    }
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false, status: 413, error: "Request payload quá lớn." };
    }
    chunks.push(value);
  }

  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, body: JSON.parse(new TextDecoder().decode(buf)) };
  } catch {
    return { ok: false, status: 400, error: "Body JSON không hợp lệ." };
  }
}
