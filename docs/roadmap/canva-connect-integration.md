# [Roadmap/Proposal] Tích hợp Canva Connect API vào zVas Banner AI

> **Trạng thái: chưa triển khai.** Đây là tài liệu thiết kế/kế hoạch — các route `/api/canva/**` và bảng `canva_tokens` mô tả dưới đây **chưa tồn tại** trong codebase. Không dùng file này như tài liệu tham chiếu cho hệ thống hiện tại (xem [Backend](../backend.md)/[API Reference](../api.md) cho cái đang chạy thật).

Mục tiêu: sau khi user tạo banner xong, bấm nút **"Mở trong Canva"** → banner được upload vào Canva của user → mở thẳng Canva Editor với design chứa banner đó để chỉnh sửa tiếp.

Luồng end-to-end:

```
User bấm "Mở trong Canva" (ExportPopover)
        │
        ├─ Chưa kết nối Canva? → OAuth PKCE (/api/canva/auth/start → Canva → /api/canva/auth/callback)
        │                        Lưu access_token + refresh_token (mã hóa) theo Clerk userId
        │
        └─ Đã kết nối → POST /api/canva/open { imageDataUrl, canvasConfig, title }
                 │
                 ├─ 1. POST /rest/v1/asset-uploads (upload binary PNG) → job id
                 ├─ 2. Poll GET /rest/v1/asset-uploads/{jobId} đến khi success → asset_id
                 ├─ 3. POST /rest/v1/designs { type_and_asset, custom WxH, asset_id } → edit_url
                 │
                 └─ Client: window.open(edit_url)
```

Cơ sở kỹ thuật (đã xác nhận từ docs Canva, 07/2026):

- Connect API dùng **OAuth 2.0 Authorization Code + PKCE (SHA-256)**; authorize URL là `https://www.canva.com/api/oauth/authorize`, token endpoint là `https://api.canva.com/rest/v1/oauth/token` (chỉ gọi từ backend, dùng Basic auth `client_id:client_secret`).
- **Create design**: `POST /rest/v1/designs` với `type_and_asset` — truyền `design_type` custom (width/height 40–8000px, diện tích ≤ 25M px²) + `asset_id` (chỉ hỗ trợ image). Response có `urls.edit_url` — URL tạm, **chỉ user đã authorize truy cập được, hiệu lực 30 ngày**. Rate limit: **20 req/phút/user**.
- **Asset upload**: async job; ảnh < 50MB; PNG/JPEG được hỗ trợ.
- Access token TTL ngắn (~4 giờ); **refresh token dùng một lần** — mỗi lần refresh trả về refresh token MỚI, phải lưu đè.
- Redirect URI local phải dùng `127.0.0.1`, **không dùng `localhost`**.

---

## Bước 0 — Đăng ký integration trên Canva Developer Portal

1. Vào **https://www.canva.com/developers/** → đăng nhập tài khoản Canva → **Your integrations** → **Create an integration**.
2. Chọn loại: **Public** (cho phép mọi user Canva connect — cần Canva review trước khi phát hành) hoặc **Private** (chỉ team của bạn — dùng được ngay, phù hợp giai đoạn dev). Khuyến nghị: tạo **Private/draft trước để dev**, submit review sau khi hoàn thiện.
3. Trong **Configuration**:
   - **Integration name**: `zVas Banner AI`
   - **Client ID**: copy lại → `CANVA_CLIENT_ID`
   - **Generate secret**: bấm và lưu ngay (chỉ hiện 1 lần) → `CANVA_CLIENT_SECRET`
4. Trong **Scopes**, bật tối thiểu:
   | Scope | Quyền | Dùng cho |
   |---|---|---|
   | `asset` | Read + Write | Upload banner PNG vào library user |
   | `design:content` | Write | Create design từ asset |
   | `design:meta` | Read | (tùy chọn) đọc metadata design |
   | `profile` | Read | (tùy chọn) hiển thị "Đã kết nối với tài khoản X" |
5. Trong **Authentication → Add Authentication**, thêm **2 redirect URL**:
   - `https://zvas-banner.vercel.app/api/canva/auth/callback`
   - `http://127.0.0.1:3000/api/canva/auth/callback`
6. (Tùy chọn) **Return navigation**: bật và đặt Return URL `https://zvas-banner.vercel.app/canva/return` — Canva sẽ hiện nút quay lại app của bạn từ trong editor.

> Lưu ý review: integration ở trạng thái draft chỉ dùng được bởi thành viên team Canva của bạn. Muốn user thật dùng được, submit review trong Portal (mô tả use case: "AI-generated marketing banner (PNG/JPEG) uploaded as image asset, opened in Canva for further editing" — media asset use case, không phải structured data).

---

## Bước 1 — Database & môi trường

### 1.1 Bảng `canva_tokens`

```sql
-- db/canva_tokens.sql
CREATE TABLE IF NOT EXISTS canva_tokens (
  clerk_user_id   TEXT PRIMARY KEY,
  access_token    TEXT NOT NULL,          -- đã mã hóa AES-256-GCM
  refresh_token   TEXT NOT NULL,          -- đã mã hóa
  expires_at      BIGINT NOT NULL,        -- Unix ms
  canva_user_id   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

Chạy migration: `psql "$DATABASE_URL" -f db/canva_tokens.sql`

### 1.2 Biến môi trường (`.env.local` + Vercel Production)

```bash
CANVA_CLIENT_ID=OC-xxxxxxxx
CANVA_CLIENT_SECRET=cnvca...
CANVA_TOKEN_ENCRYPTION_KEY=<32 bytes hex, ví dụ: openssl rand -hex 32>
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000   # local; Vercel: https://zvas-banner.vercel.app
```

`redirectUri` build động: `${process.env.NEXT_PUBLIC_APP_URL}/api/canva/auth/callback`.

> Local dev: chạy `npm run dev` rồi truy cập app qua **http://127.0.0.1:3000** (không phải localhost) để cookie + redirect khớp.

---

## Bước 2 — OAuth PKCE flow

### 2.1 Helper mã hóa token — `lib/canva/crypto.ts`

```ts
import crypto from "crypto";

const KEY = Buffer.from(process.env.CANVA_TOKEN_ENCRYPTION_KEY!, "hex");

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map(b => b.toString("base64")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map(s => Buffer.from(s, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
```

### 2.2 Start — `app/api/canva/auth/start/route.ts`

```ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import crypto from "crypto";
import { cookies } from "next/headers";

const SCOPES = "asset:read asset:write design:content:write design:meta:read profile:read";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.redirect(new URL("/sign-in", process.env.NEXT_PUBLIC_APP_URL));

  // PKCE
  const codeVerifier = crypto.randomBytes(64).toString("base64url"); // 43–128 ký tự
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  const state = crypto.randomBytes(24).toString("base64url");

  const jar = await cookies();
  const cookieOpts = { httpOnly: true, secure: true, sameSite: "lax" as const, maxAge: 600, path: "/" };
  jar.set("canva_code_verifier", codeVerifier, cookieOpts);
  jar.set("canva_oauth_state", state, cookieOpts);

  const url = new URL("https://www.canva.com/api/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.CANVA_CLIENT_ID!);
  url.searchParams.set("redirect_uri", `${process.env.NEXT_PUBLIC_APP_URL}/api/canva/auth/callback`);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "s256");
  url.searchParams.set("state", state);

  return NextResponse.redirect(url);
}
```

### 2.3 Callback — `app/api/canva/auth/callback/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";
import { encrypt } from "@/lib/canva/crypto";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.redirect(new URL("/sign-in", process.env.NEXT_PUBLIC_APP_URL));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const jar = await cookies();
  const codeVerifier = jar.get("canva_code_verifier")?.value;
  const savedState = jar.get("canva_oauth_state")?.value;

  if (!code || !codeVerifier || !state || state !== savedState) {
    return NextResponse.redirect(new URL("/?canva=error", process.env.NEXT_PUBLIC_APP_URL));
  }

  const basic = Buffer.from(
    `${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch("https://api.canva.com/rest/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/canva/auth/callback`,
    }),
  });

  if (!res.ok) {
    return NextResponse.redirect(new URL("/?canva=error", process.env.NEXT_PUBLIC_APP_URL));
  }

  const tokens = await res.json(); // { access_token, refresh_token, expires_in, ... }
  const expiresAt = Date.now() + tokens.expires_in * 1000;

  await pool.query(
    `INSERT INTO canva_tokens (clerk_user_id, access_token, refresh_token, expires_at, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (clerk_user_id)
     DO UPDATE SET access_token=$2, refresh_token=$3, expires_at=$4, updated_at=now()`,
    [userId, encrypt(tokens.access_token), encrypt(tokens.refresh_token), expiresAt]
  );

  jar.delete("canva_code_verifier");
  jar.delete("canva_oauth_state");

  // Quay lại editor, client tự tiếp tục flow "mở Canva"
  return NextResponse.redirect(new URL("/?canva=connected", process.env.NEXT_PUBLIC_APP_URL));
}
```

### 2.4 Auto-refresh — `lib/canva/tokens.ts`

```ts
import { pool } from "@/lib/db";
import { encrypt, decrypt } from "./crypto";

const REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh sớm 5 phút

export async function getValidAccessToken(clerkUserId: string): Promise<string | null> {
  const { rows } = await pool.query(
    "SELECT access_token, refresh_token, expires_at FROM canva_tokens WHERE clerk_user_id=$1",
    [clerkUserId]
  );
  if (!rows[0]) return null; // chưa connect → client phải chạy OAuth

  const row = rows[0];
  if (Date.now() < Number(row.expires_at) - REFRESH_MARGIN_MS) {
    return decrypt(row.access_token);
  }

  // Hết hạn → refresh. QUAN TRỌNG: refresh token là single-use, phải lưu token mới.
  const basic = Buffer.from(
    `${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch("https://api.canva.com/rest/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decrypt(row.refresh_token),
    }),
  });

  if (!res.ok) {
    // Refresh token bị revoke/expired → xóa record, bắt user connect lại
    await pool.query("DELETE FROM canva_tokens WHERE clerk_user_id=$1", [clerkUserId]);
    return null;
  }

  const t = await res.json();
  await pool.query(
    `UPDATE canva_tokens SET access_token=$2, refresh_token=$3, expires_at=$4, updated_at=now()
     WHERE clerk_user_id=$1`,
    [clerkUserId, encrypt(t.access_token), encrypt(t.refresh_token), Date.now() + t.expires_in * 1000]
  );
  return t.access_token;
}
```

---

## Bước 3 — Endpoint `/api/canva/open`

Upload banner → poll job → create design → trả `edit_url`.

`app/api/canva/open/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getValidAccessToken } from "@/lib/canva/tokens";

export const maxDuration = 60;

const CANVA_API = "https://api.canva.com/rest/v1";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const token = await getValidAccessToken(userId);
  if (!token) {
    // Client nhận mã này → redirect sang /api/canva/auth/start
    return NextResponse.json({ error: "Chưa kết nối Canva", errorCode: "CANVA_NOT_CONNECTED" }, { status: 428 });
  }

  const { imageDataUrl, canvasConfig, title } = await req.json();
  if (!imageDataUrl?.startsWith("data:image/")) {
    return NextResponse.json({ error: "imageDataUrl không hợp lệ" }, { status: 400 });
  }

  // 1) Data URL → Buffer
  const base64 = imageDataUrl.split(",")[1];
  const bytes = Buffer.from(base64, "base64"); // banner PNG, thường vài MB (< 50MB OK)

  // 2) Tạo asset upload job (binary body + metadata header)
  const name = title || `zVas Banner ${new Date().toISOString().slice(0, 10)}`;
  const uploadRes = await fetch(`${CANVA_API}/asset-uploads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Asset-Upload-Metadata": JSON.stringify({
        name_base64: Buffer.from(name).toString("base64"),
      }),
    },
    body: bytes,
  });
  if (!uploadRes.ok) {
    return NextResponse.json({ error: "Upload Canva thất bại", errorCode: "CANVA_UPLOAD_FAILED" }, { status: 502 });
  }
  let job = (await uploadRes.json()).job;

  // 3) Poll đến khi job xong (backoff nhẹ, tối đa ~30s)
  const started = Date.now();
  while (job.status === "in_progress") {
    if (Date.now() - started > 30_000) {
      return NextResponse.json({ error: "Canva xử lý ảnh quá lâu", errorCode: "CANVA_UPLOAD_TIMEOUT" }, { status: 504 });
    }
    await new Promise(r => setTimeout(r, 1500));
    const poll = await fetch(`${CANVA_API}/asset-uploads/${job.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    job = (await poll.json()).job;
  }
  if (job.status !== "success" || !job.asset?.id) {
    return NextResponse.json(
      { error: job.error?.message || "Upload thất bại", errorCode: "CANVA_UPLOAD_FAILED" },
      { status: 502 }
    );
  }

  // 4) Create design đúng kích thước canvas + gắn asset
  //    Giới hạn Canva: mỗi chiều 40–8000px, diện tích ≤ 25,000,000 px²
  const width = Math.min(Math.max(canvasConfig?.width ?? 1200, 40), 8000);
  const height = Math.min(Math.max(canvasConfig?.height ?? 628, 40), 8000);

  const designRes = await fetch(`${CANVA_API}/designs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "type_and_asset",
      design_type: { type: "custom", width, height },
      asset_id: job.asset.id,
      title: name,
    }),
  });
  if (!designRes.ok) {
    return NextResponse.json({ error: "Tạo design Canva thất bại", errorCode: "CANVA_DESIGN_FAILED" }, { status: 502 });
  }
  const { design } = await designRes.json();

  // edit_url: chỉ user này mở được, hiệu lực 30 ngày
  return NextResponse.json({
    editUrl: design.urls.edit_url,
    designId: design.id,
  });
}
```

Ghi chú:

- Create design bị rate limit **20 req/phút/user** — đủ rộng cho use case này, nhưng nên disable nút trong lúc đang xử lý.
- Design tạo bằng API mà user **không edit trong 7 ngày sẽ bị Canva xóa vĩnh viễn** (bỏ qua trash) — không sao vì mình mở editor ngay.

---

## Bước 4 — UI: `CanvaOpenButton` trong `ExportPopover.tsx`

`components/layout/CanvaOpenButton.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useEditorStore } from "@/store/editor";

export function CanvaOpenButton() {
  const [loading, setLoading] = useState(false);
  const generatedImage = useEditorStore(s => s.generatedImage);
  const canvasConfig = useEditorStore(s => s.canvasConfig);

  // Sau khi OAuth callback redirect về /?canva=connected → tự tiếp tục
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("canva") === "connected" && generatedImage) {
      window.history.replaceState({}, "", window.location.pathname);
      openInCanva();
    }
    if (params.get("canva") === "error") {
      window.history.replaceState({}, "", window.location.pathname);
      toast.error("Kết nối Canva thất bại. Vui lòng thử lại.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openInCanva() {
    if (!generatedImage) return;
    setLoading(true);
    try {
      const res = await fetch("/api/canva/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: generatedImage,
          canvasConfig,
          title: canvasConfig?.name ? `zVas – ${canvasConfig.name}` : undefined,
        }),
      });

      if (res.status === 428) {
        // Chưa connect → chạy OAuth (full-page redirect)
        window.location.href = "/api/canva/auth/start";
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Không mở được Canva");
        return;
      }
      window.open(data.editUrl, "_blank", "noopener");
      toast.success("Đã mở banner trong Canva");
    } catch {
      toast.error("Lỗi kết nối. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={openInCanva}
      disabled={!generatedImage || loading}
      className="canva-open-button"
      aria-busy={loading}
    >
      {loading ? "Đang chuyển sang Canva…" : "Mở trong Canva"}
    </button>
  );
}
```

Thêm vào `ExportPopover.tsx` cạnh nút export PNG/JPG. UX nhỏ nhưng đáng làm: label lúc loading nên tách 2 pha nếu muốn ("Đang tải ảnh lên Canva…" → "Đang tạo design…") vì tổng thời gian có thể 5–15s; tap target ≥ 44px; giữ focus state rõ ràng.

> Lưu ý về data URL lớn: banner 2x có thể vài MB base64 → body JSON gửi lên `/api/canva/open` sẽ lớn. Nếu gặp giới hạn body Vercel (~4.5MB cho serverless), phương án: nén ảnh client-side trước khi gửi, hoặc upload banner lên storage tạm (Vercel Blob) rồi dùng endpoint **Create asset upload job via URL** của Canva thay cho binary upload.

---

## Bước 5 — (Tùy chọn) Return navigation

Nếu bật trong Portal, Canva editor hiển thị nút quay về app. Canva sẽ redirect về Return URL kèm `correlation_state` + `design_id`. Tạo `app/canva/return/page.tsx` đơn giản: đọc `design_id`, hiển thị "Bạn đã chỉnh sửa xong trên Canva" và (giai đoạn sau) có thể gọi **Export API** của Canva để kéo bản final về lại zVas.

---

## Bước 6 — Checklist test

Local (`http://127.0.0.1:3000`):

1. Đăng nhập Clerk → tạo banner → bấm **Mở trong Canva** lần đầu → redirect sang Canva consent → approve → quay về app → tự động tiếp tục → tab Canva mở đúng banner, đúng kích thước canvas.
2. Bấm lần 2 (đã có token) → mở Canva ngay không cần consent.
3. Đợi > 4 giờ (hoặc sửa `expires_at` trong DB về quá khứ) → bấm lại → auto-refresh chạy, vẫn mở được; kiểm tra `refresh_token` trong DB đã đổi giá trị.
4. Xóa row trong `canva_tokens` → bấm lại → quay về flow consent (status 428).
5. Revoke integration từ phía Canva (canva.com → Settings → Connected apps) → bấm nút → refresh fail → record bị xóa → user được đưa về consent.
6. Banner kích thước lạ (rất nhỏ/rất lớn) → width/height được clamp 40–8000.

Production: lặp lại (1)(2) trên `https://zvas-banner.vercel.app` với redirect URI production đã đăng ký; nhớ set đủ 4 env var trên Vercel và redeploy.

## Lỗi thường gặp

| Triệu chứng | Nguyên nhân / xử lý |
|---|---|
| Canva báo `invalid redirect_uri` | URI trong Portal phải khớp **từng ký tự** (scheme, host, path, không thừa slash). Local phải là `127.0.0.1`. |
| Token endpoint trả 401 | Sai Basic auth — kiểm tra base64 của `client_id:client_secret`, secret không bị copy thiếu ký tự. |
| Refresh trả `invalid_grant` | Refresh token đã bị dùng (single-use) — thường do race condition 2 request refresh song song. Fix: lock theo user (advisory lock Postgres) hoặc chấp nhận xóa record và cho connect lại. |
| Design mở ra trắng | `asset_id` chưa `success` khi create design — đảm bảo poll xong mới create. |
| Body quá lớn / 413 | Xem ghi chú data URL ở Bước 4 (nén hoặc dùng upload-via-URL). |
| User khác trong team không dùng được | Integration còn ở draft/private — submit review để public. |

## Tham khảo

- Authentication (PKCE): https://www.canva.dev/docs/connect/authentication/
- Create asset upload job: https://www.canva.dev/docs/connect/api-reference/assets/
- Create design: https://www.canva.dev/docs/connect/api-reference/designs/create-design/
- Starter kit chính thức (có demo OAuth + token encryption): https://github.com/canva-sdks/canva-connect-api-starter-kit
