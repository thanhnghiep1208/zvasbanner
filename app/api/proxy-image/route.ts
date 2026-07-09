import { isIPv4, isIPv6 } from "node:net";
import { lookup } from "node:dns/promises";

import { NextResponse } from "next/server";

import { requireUserJson } from "@/lib/require-user";

const MAX_REDIRECTS = 3;
const MAX_BYTES = 20 * 1024 * 1024; // 20MB
const FETCH_TIMEOUT_MS = 10_000;

function isReservedIpv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0) return true; // 192.0.0.0/24, 192.0.2.0/24
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
  if (a === 198 && b === 51) return true; // 198.51.100.0/24
  if (a === 203 && b === 0) return true; // 203.0.113.0/24
  if (a >= 224) return true; // multicast (224-239) + reserved/broadcast (240-255)
  return false;
}

function isReservedIpv6(ip: string): boolean {
  const h = ip.toLowerCase();
  if (h === "::1" || h === "::") return true; // loopback / unspecified
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // fc00::/7 unique local
  if (h.startsWith("fe80:") || h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) {
    return true; // fe80::/10 link-local
  }
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isReservedIpv4(mapped[1]);
  return false;
}

function isReservedIp(ip: string): boolean {
  if (isIPv4(ip)) return isReservedIpv4(ip);
  if (isIPv6(ip)) return isReservedIpv6(ip);
  return true; // unknown format — fail closed
}

/**
 * Validates protocol + resolves the hostname to concrete IPs and rejects
 * private/loopback/link-local/metadata targets. Re-run on every redirect hop
 * so DNS-rebinding or a redirect to an internal host can't slip through.
 */
async function validateTarget(target: URL): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return { ok: false, error: "Only http and https URLs are allowed", status: 400 };
  }

  const hostname = target.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { ok: false, error: "URL not allowed", status: 403 };
  }

  let addresses: string[];
  if (isIPv4(hostname) || isIPv6(hostname)) {
    addresses = [hostname];
  } else {
    try {
      const results = await lookup(hostname, { all: true, verbatim: true });
      addresses = results.map((r) => r.address);
    } catch {
      return { ok: false, error: "Could not resolve host", status: 400 };
    }
  }

  if (addresses.length === 0 || addresses.some(isReservedIp)) {
    return { ok: false, error: "URL not allowed", status: 403 };
  }
  return { ok: true };
}

export async function GET(request: Request) {
  const authGate = await requireUserJson({
    error: "Cần đăng nhập để tải ảnh qua proxy.",
  });
  if (authGate instanceof NextResponse) return authGate;

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  let upstream: Response | undefined;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const validation = await validateTarget(target);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    let res: Response;
    try {
      res = await fetch(target.toString(), {
        redirect: "manual",
        headers: { Accept: "image/*,*/*;q=0.8" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 });
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop === MAX_REDIRECTS) {
        return NextResponse.json({ error: "Too many redirects" }, { status: 502 });
      }
      try {
        target = new URL(res.headers.get("location")!, target);
      } catch {
        return NextResponse.json({ error: "Invalid redirect target" }, { status: 502 });
      }
      continue;
    }

    upstream = res;
    break;
  }

  if (!upstream) {
    return NextResponse.json({ error: "Too many redirects" }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Upstream returned ${upstream.status}` },
      { status: upstream.status >= 500 ? 502 : 424 }
    );
  }

  const contentType =
    upstream.headers.get("Content-Type")?.split(";")[0]?.trim() || "image/png";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Response is not an image" }, { status: 415 });
  }

  const declaredLength = Number(upstream.headers.get("Content-Length") ?? "0");
  if (declaredLength > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  const reader = upstream.body?.getReader();
  if (!reader) {
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 });
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }
    chunks.push(value);
  }

  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
