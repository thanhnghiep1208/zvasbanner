# Backend

Tài liệu mô tả **Route Handlers, RBAC, tích hợp Gemini, analytics DB, và các lớp bảo mật** của AI Banner Generator. Toàn bộ backend chạy trong **cùng repo Next.js** (App Router Route Handlers, Node runtime) — không có service riêng.

> Xem [Frontend](./frontend.md) cho UI/state, [API Reference](./api.md) cho contract request/response từng endpoint.

## Route Handlers (`app/api/**/route.ts`)

| Route | Method | Permission | Mô tả |
| --- | --- | --- | --- |
| `/api/generate` | `POST` | `generate_image` | Tạo banner từ prompt + assets (multimodal Gemini) + harmony pass ngầm. |
| `/api/enhance-prompt` | `POST` | `generate_image` | Viết lại/cải thiện `userPrompt` bằng Gemini text. |
| `/api/edit-image` | `POST` | `generate_image` | Chỉnh sửa nhẹ ảnh đã tạo (`imageDataUrl` + `editPrompt`). |
| `/api/proxy-image` | `GET` | đăng nhập (bất kỳ role) | Proxy ảnh remote cho canvas/export, tránh CORS taint. |
| `/api/track` | `POST` | đăng nhập | Ghi 1 event analytics vào `banner_events`. |
| `/api/dashboard` | `GET` | `view_dashboard` | Aggregate metrics theo khoảng thời gian. |
| `/api/dashboard/users` | `GET/PATCH/POST/DELETE` | `view_dashboard`/`manage_roles`/`block_user`/`delete_user` | Danh sách + quản trị user (role, block, xóa). |
| `/api/dashboard/users/sessions` | `GET/DELETE` | `block_user` (chỉ `admin`) | Xem/thu hồi phiên của user khác. |
| `/api/sessions` | `GET/DELETE` | đăng nhập | User tự xem/thu hồi phiên Clerk của chính mình. |

Chi tiết request/response từng route: [API Reference](./api.md).

## RBAC (`lib/authz.ts`, `lib/require-user.ts`)

- Role: `admin` | `mod` | `editor` (mặc định `editor` nếu Clerk metadata không set).
- Role đọc từ `privateMetadata.role` (ưu tiên) hoặc `publicMetadata.role`; `blocked` từ `privateMetadata.blocked`/`publicMetadata.blocked`.
- **Admin override qua env**: nếu set `ADMIN_EMAIL` (server-only), user có **primary email** khớp (case-insensitive) luôn được coi là `admin`, bất kể metadata Clerk — dùng cho tài khoản chủ dự án khi chưa set metadata thủ công. Không hardcode email trong code (xem `.env.local.example`).
- Permission: `view_dashboard`, `manage_roles`, `block_user`, `delete_user`, `generate_image` — ma trận role→permission trong `ROLE_PERMISSIONS` (`lib/authz.ts`).
- Gate dùng trong route: `requireUserJson()` (chỉ cần đăng nhập) và `requirePermissionJson()` (đăng nhập + permission + không bị block) — trả `401`/`403` JSON nếu fail, ngược lại trả `{ userId, role }`.
- Cache role/block lookup Clerk **60s** (`USER_ACCESS_CACHE_MS`, `lib/dashboard.ts`), xoá cache khi đổi role/block/xóa user (`invalidateUserAccessCache`).
- **Mod không được đổi role thành `admin`**, và **không được sửa role của user hiện đang là `admin`** (không thể promote lẫn demote một admin) — chặn ở `PATCH /api/dashboard/users` (`app/api/dashboard/users/route.ts`).

## Middleware (`proxy.ts`)

Next.js 16 dùng file `proxy.ts` (thay `middleware.ts`) cho request interception. App export `clerkMiddleware()` mặc định, matcher áp dụng cho toàn bộ route UI + `/api/**` (trừ static asset theo extension). Middleware chỉ đồng bộ session Clerk — **không** tự chặn theo role; việc chặn permission nằm trong từng route handler qua `requirePermissionJson`.

## Tích hợp Gemini (`lib/gemini-server.ts`)

- `IMAGE_MODEL_MAP`: `nano-banana-pro` → `gemini-3-pro-image-preview` (mặc định), `nano-banana-2` → `gemini-3.1-flash-image-preview`.
- `geminiGenerateOneImage()` — build multimodal parts (text + inline image data) từ assets, gọi model ảnh.
- `runHarmonyPass()` — sau generate Gemini thành công, chạy một lần chỉnh cohesion (ánh sáng, AO shadow, color grade) qua prompt cố định `HARMONY_EDIT_PROMPT`; best-effort, timeout riêng ~30s, lỗi thì trả ảnh gốc + `harmonyApplied: false`.
- `geminiEditImage()` — dùng cho `/api/edit-image`: sửa nhẹ ảnh đã tạo, giữ composition.
- `runGeminiEnhance()` — viết lại prompt text (`/api/enhance-prompt`).
- Prompt được ghép theo layer trong `lib/prompt-builder.ts`: system → context (canvas/assets/brand kit/marketing brief) → creative (`buildCohesionInstructions`, style, campaign intent/focal subject phrase) → output priority.
- Timeout: enhance ~30s, harmony pass ~30s, generate ảnh chính ~58s; route `generate` có `maxDuration = 90`; client timeout tương ứng ~92s (`lib/client-generation.ts`).

## Analytics & Dashboard DB (PostgreSQL)

- Bảng `banner_events` (`db/banner_events.sql`), pool kết nối qua `lib/db.ts` (`getDbPool()`, cần `DATABASE_URL`).
- `POST /api/track` insert một dòng; `user_id` **luôn** lấy từ session Clerk server-side, field `user_id` trong body bị bỏ qua.
- `GET /api/dashboard` — aggregate theo `range` (`today`/`7d`/`30d`), cache kết quả **30 phút** (`DASHBOARD_AGGREGATE_CACHE_MS`), bypass bằng `?refresh=1`.
- `GET /api/dashboard/users` — phân trang **15 user/trang** (`DASHBOARD_USERS_PAGE_SIZE`), enrich tên/email/role/blocked từ Clerk.
- Hành động admin (đổi role, block, xóa user, thu hồi phiên) ghi audit qua `lib/dashboard-audit.ts` → `banner_events` với `event_name = admin_audit` (không được ghi từ client track trực tiếp).

## Bảo mật

Các lớp bảo vệ đã áp dụng ở backend, tập trung tại các điểm nhận input từ bên ngoài hoặc gọi ra ngoài:

### HTTP security headers (`next.config.mjs`)

- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (tắt camera/mic/geolocation/payment).
- **Content-Security-Policy**: `default-src 'self'`; `script-src`/`connect-src` cho phép thêm **Clerk Frontend API host** (tự decode từ `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` lúc build/start — đổi key thì CSP tự khớp, không hardcode domain), **Cloudflare Turnstile** (`challenges.cloudflare.com`, dùng cho Clerk bot protection), **Vercel Analytics**; `'unsafe-eval'` chỉ bật ở `development` (cần cho Fast Refresh), bị loại ở production.
- **Strict-Transport-Security**: `max-age=31536000; includeSubDomains`.
- Clerk **telemetry đã bị tắt** (`<ClerkProvider telemetry={false}>` trong `app/layout.tsx`) — tránh phải mở thêm `connect-src` cho `clerk-telemetry.com` chỉ để phục vụ một beacon không có giá trị chức năng.

### Chống SSRF — `GET /api/proxy-image`

`app/api/proxy-image/route.ts` yêu cầu đăng nhập, sau đó với mỗi request (và **mỗi hop redirect**, tối đa 3 hop):

1. Resolve hostname qua `dns.lookup` (không chỉ regex trên chuỗi hostname) và chặn nếu **bất kỳ** IP trả về thuộc private/loopback/link-local/CGNAT/cloud-metadata (IPv4 + IPv6) — chống bypass kiểu **DNS-rebinding** (domain public trỏ về `127.0.0.1`/`169.254.169.254`).
2. Follow redirect **thủ công** (`redirect: "manual"`) và re-validate target mới mỗi hop, thay vì `redirect: "follow"` (vốn không re-check host sau redirect).
3. Giới hạn kích thước response **20MB**, enforce cả trên `Content-Length` khai báo và trên **byte thực tế đọc được** trong lúc stream (không tin server upstream báo đúng header).
4. Timeout fetch 10s.

### Rate limit + request size cap — `lib/request-limits.ts`

Dùng chung cho `/api/generate`, `/api/edit-image`, `/api/enhance-prompt`:

- `createRateLimiter(max, windowMs)` — sliding-window **per-instance** (in-memory `Map`), mặc định **20 request/giờ/user**. Vì là per-instance, trên Vercel serverless với nhiều instance chạy song song, giới hạn thực tế có thể cao hơn con số khai báo — muốn enforce chính xác toàn cục cần chuyển sang Redis/KV.
- `readJsonWithSizeLimit(req, maxBytes)` — đọc body qua `ReadableStream` và đếm **byte thực tế**, abort ngay khi vượt cap; không chỉ dựa vào header `Content-Length` (client dùng chunked transfer hoặc header sai vẫn bị chặn đúng). Cap: `generate` 30MB, `enhance-prompt` 30MB (có thể kèm `assets[].dataUrl`), `edit-image` 20MB (một ảnh + prompt).

### Không leak chi tiết lỗi kỹ thuật ra client

Lỗi từ Gemini SDK (`reason`/`message`) chỉ được `console.error(...)` **server-side**; response trả cho client chỉ gồm message thân thiện đã phân loại (`normalizeGenerationError`/`classifyEditError`/`normalizeEnhanceError`) + `errorCode` ngắn — áp dụng cho `/api/generate`, `/api/edit-image`, `/api/enhance-prompt`.

### Dependency hygiene

`@clerk/nextjs` cần giữ ở bản mới trong nhánh 7.x (đang `^7.5.15`) — bản cũ (`7.3.3`) kéo theo `js-cookie` có lỗ hổng **high severity** qua `@clerk/shared`. Chạy `npm audit --omit=dev` định kỳ; các cảnh báo còn lại (`hono`, `js-yaml` qua eslint/shadcn CLI; `qs`/`postcss` bundled trong `next`) là dev-tooling hoặc cần downgrade `next` breaking để fix, không ảnh hưởng runtime app.

## Liên kết

- [Frontend](./frontend.md)
- [API Reference](./api.md)
- [Architecture](./architecture.md)
- [Deploy](./deploy.md)
- [Workflow](./workflow.md)
