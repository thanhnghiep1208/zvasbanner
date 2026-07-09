# API Reference

Tài liệu mô tả **contract** các Route Handlers dưới `app/api/`. Mọi endpoint JSON nên gửi header `Content-Type: application/json` khi có body.

## Ghi chú chung

- **Auth & RBAC**: một số endpoint yêu cầu **đã đăng nhập** Clerk và có **permission** phù hợp (xem từng mục). `401` khi chưa đăng nhập; `403` khi thiếu quyền hoặc tài khoản **blocked**. Logic role/permission: `lib/authz.ts`, gate: `requirePermissionJson` trong `lib/require-user.ts`.
- **Model ảnh (generate)**: theo field `imageModel` trong body — `nano-banana-pro` → `gemini-3-pro-image-preview`, `nano-banana-2` → `gemini-3.1-flash-image-preview` (mặc định server nếu thiếu/sai: Pro). **Edit-image** dùng model theo implementation trong `lib/gemini-server.ts` (thường cùng family flash/pro tùy route).
- **Ảnh trả về**: thường là chuỗi **data URL** (`data:image/png;base64,...`) hoặc định dạng tương thích client (ví dụ thẻ img với `src` trỏ tới data URL).
- **Lỗi thân thiện + mã ngắn**: client có thể hiển thị tiền tố dạng `[E-GEN-…]`, `[E-ENH-…]`, `[E-EXP-…]`; server `edit-image` trả các mã kiểu `EDIT_TIMEOUT`, `EDIT_AUTH`, … trong trường `errorCode`. **Chi tiết kỹ thuật (raw error từ Gemini SDK) không còn trả về client** — chỉ `console.error` server-side; client chỉ nhận message thân thiện + `errorCode`.
- **Rate limit + kích thước request** (`/api/generate`, `/api/enhance-prompt`, `/api/edit-image`): mặc định **20 request/giờ/user** (in-memory, per-instance — xem `lib/request-limits.ts`), vượt hạn mức trả `429`. Kích thước body cap **30MB** (`generate`, `enhance-prompt`) hoặc **20MB** (`edit-image`), enforce trên **byte thực tế đọc từ stream** (không chỉ header `Content-Length`) → `413` nếu vượt.
- **Timeout**: generate trên server tối đa ~90s (`maxDuration` route, gồm generate chính ~58s + **harmony pass** tối đa 30s); client `requestGeneration*` timeout ~92s (`lib/client-generation.ts`). Edit-image timeout ~45s. Quá hạn generate → placeholder; harmony pass fail → trả ảnh generate gốc (best-effort).
- **Harmony pass (ngầm)**: sau khi `source === "gemini"`, server tự chạy một lần chỉnh cohesion (ánh sáng, viền, color grade) qua `runHarmonyPass` — không phải API riêng; xem `meta.harmonyApplied`.

---

## 1) `POST /api/generate`

Tạo **một** banner từ prompt + assets (multimodal).

### Request body (rút gọn)

```json
{
  "canvasConfig": {
    "width": 1200,
    "height": 628,
    "platform": "Social Media",
    "name": "Facebook Ad"
  },
  "assets": [
    {
      "id": "asset-1",
      "url": "blob:http://...",
      "dataUrl": "data:image/png;base64,...",
      "fileName": "product.png",
      "role": "image",
      "hasAlpha": true,
      "originalDims": { "width": 1024, "height": 1024 }
    }
  ],
  "brandKit": {
    "colors": ["#111111", "#ffffff"]
  },
  "userPrompt": "Banner khuyến mãi...",
  "styleControls": {
    "style": "minimalist",
    "mood": "professional",
    "colorPalette": "auto",
    "fontStyle": "modern",
    "strictPreserveMode": true,
    "backgroundConfig": {
      "tones": [],
      "grains": [],
      "shapes": [],
      "effects": []
    }
  },
  "imageModel": "nano-banana-pro"
}
```

- `imageModel` (tùy chọn): `nano-banana-pro` | `nano-banana-2`. Thiếu hoặc không hợp lệ → server dùng `nano-banana-pro`.

### Success — `200`

```json
{
  "image": "data:image/png;base64,...",
  "source": "gemini",
  "meta": {
    "model": "gemini-3-pro-image-preview",
    "elapsedMs": 8421,
    "promptTokens": 2100,
    "outputTokens": 340,
    "totalTokens": 2440,
    "costUsd": 0.000519,
    "harmonyApplied": true
  }
}
```

`meta.totalTokens` / `meta.costUsd` có thể vắng tùy response model (cost thường là ước lượng). `meta.elapsedMs` / token / cost chỉ phản ánh **lần generate đầu**, chưa cộng harmony pass.

- `meta.harmonyApplied` (boolean, tùy chọn): `true` khi bước harmony pass (post-process) chạy thành công; `false` hoặc vắng khi harmony bỏ qua (timeout/lỗi) hoặc `source === "placeholder"` (không chạy harmony).

### Harmony pass (server, không expose endpoint)

Sau generate Gemini thành công, `app/api/generate/route.ts` gọi `runHarmonyPass` (`lib/gemini-server.ts`):

- Prompt cố định `HARMONY_EDIT_PROMPT` — chỉ cohesion (ánh sáng, feather edge, AO shadow, color grade, vignette); **không** đổi layout/copy/vị trí subject.
- Timeout riêng **30s**; lỗi/timeout → log warning, trả ảnh trước harmony, `harmonyApplied: false`.
- Dùng cùng pipeline ảnh như edit (`geminiGenerateOneImage` + asset base image), model theo `imageModel` trong request.

### Placeholder fallback — `200` (ảnh dự phòng khi model lỗi)

```json
{
  "image": "data:image/svg+xml;charset=utf-8,...",
  "source": "placeholder",
  "meta": {
    "model": "nano-banana-pro",
    "elapsedMs": 45001
  },
  "failedStep": "gemini-3.1-flash-image-preview",
  "placeholderError": "…",
  "errorCode": "GEMINI_TIMEOUT"
}
```

- Khi fallback, `meta.model` hiện là **id `imageModel` phía client** (ví dụ `nano-banana-pro`), không phải tên model Gemini đầy đủ. Trường `failedStep` trong response là nhãn lỗi cố định theo implementation (xem `app/api/generate/route.ts`).

### Lỗi — `400` / `401` / `403` / `413` / `429` / `500` / `502` (tùy implementation)

- Body không phải JSON hợp lệ, thiếu field bắt buộc → `400`.
- Body vượt cap **30MB** (đếm byte thực tế, không bypass được qua chunked transfer) → `413`.
- Chưa đăng nhập Clerk → `401` (message: cần đăng nhập để tạo banner).
- Đã đăng nhập nhưng thiếu permission `generate_image` hoặc user **blocked** → `403`.
- Vượt rate limit **20 request/giờ/user** → `429`.
- Thiếu `GEMINI_API_KEY` trên server → `500`.

---

## 2) `POST /api/enhance-prompt`

Viết lại / cải thiện prompt text trước khi generate. Yêu cầu đăng nhập và permission `**generate_image`** (cùng gate với generate).

### Request body

```json
{
  "userPrompt": "Banner sale 50%",
  "canvasConfig": {
    "width": 1200,
    "height": 628,
    "platform": "Social Media",
    "name": "Facebook Ad"
  },
  "assets": []
}
```

### Success — `200`

```json
{
  "enhancedPrompt": "…"
}
```

### Lỗi

- `400`: JSON/body không hợp lệ.
- `401` / `403`: giống `POST /api/generate` (permission `generate_image`).
- `413`: body vượt cap **30MB** (body có thể kèm `assets[]` với `dataUrl`, cùng scale với `/api/generate`).
- `429`: vượt rate limit **20 request/giờ/user** (riêng với `generate`).
- `500`: thiếu key hoặc lỗi server; message thường được phân loại (quota, timeout, auth, …).

---

## 3) `POST /api/edit-image`

Chỉnh sửa **ảnh đã tạo** (multimodal: ảnh hiện tại + hướng dẫn text). Yêu cầu đăng nhập và permission `**generate_image`**. Không yêu cầu tạo lại composition hoàn toàn mới — prompt hệ thống ép giữ subject/composition, chỉ điều chỉnh nhẹ vị trí, góc, màu. Implementation dùng `geminiEditImage()` trong `lib/gemini-server.ts` (model mặc định theo `IMAGE_MODEL_MAP`, thường Pro nếu không truyền `imageModel`).

### Request body

```json
{
  "imageDataUrl": "data:image/png;base64,...",
  "editPrompt": "Đẩy sản phẩm sang trái một chút, ấm màu hơn",
  "canvasConfig": {
    "width": 1075,
    "height": 645,
    "platform": "Zalo",
    "name": "OA"
  }
}
```

- `imageDataUrl`: bắt buộc, bắt đầu bằng `data:image/`.
- `editPrompt`: bắt buộc, độ dài tối thiểu sau trim (server: ≥ 3 ký tự).
- `canvasConfig`: tùy chọn; dùng để bổ sung ngữ cảnh kích thước trong prompt.

### Success — `200`

```json
{
  "image": "data:image/png;base64,...",
  "source": "gemini",
  "meta": {
    "model": "gemini-3.1-flash-image-preview",
    "elapsedMs": 12000,
    "promptTokens": 0,
    "outputTokens": 0,
    "totalTokens": 0
  }
}
```

### Lỗi — `400` / `401` / `403` / `413` / `429` / `500` / `502`

- `400`: JSON lỗi; hoặc thiếu hoặc sai `imageDataUrl`, `editPrompt`.
- `401` / `403`: thiếu đăng nhập hoặc thiếu `generate_image` / blocked.
- `413`: body vượt cap **20MB**.
- `429`: vượt rate limit **20 request/giờ/user** (riêng với `edit-image`).
- `500`: thiếu `GEMINI_API_KEY`.
- `502`: lỗi Gemini / timeout; body có thể gồm `error` (message thân thiện, **không còn kèm raw error từ Gemini**), `errorCode` (`EDIT_TIMEOUT`, `EDIT_AUTH`, `EDIT_RATE_LIMIT`, `EDIT_UNKNOWN`), `meta`, `source: "error"`.

`maxDuration` route: 60s (Vercel / Next); timeout logic chỉnh sửa ~45s (xem code).

---

## 4) `GET /api/proxy-image`

- Đường dẫn: `GET /api/proxy-image?url=...` — tham số `**url**` là địa chỉ ảnh (chuỗi đã URL-encode, ví dụ `https%3A%2F%2F...`).
- **Yêu cầu đăng nhập** Clerk (bất kỳ role) — `401` nếu chưa đăng nhập; auth check chạy **trước** khi parse/validate `url`, nên response 401 không tiết lộ chi tiết validate.

Proxy ảnh remote để **tránh CORS** khi vẽ lên canvas / export.

### Hành vi

- Chỉ chấp nhận `http`/`https`; chặn `localhost`/`.localhost`.
- Resolve hostname qua DNS thật (`dns.lookup`) và chặn nếu **bất kỳ IP** trả về thuộc dải private/loopback/link-local/CGNAT/cloud-metadata (chống DNS-rebinding, không chỉ regex trên chuỗi hostname).
- Follow redirect **thủ công**, tối đa 3 hop, re-validate DNS ở **mỗi hop** trước khi fetch tiếp (không dùng `redirect: "follow"` mù).
- Cap kích thước response **20MB**, enforce trên byte thực đọc từ stream (không chỉ `Content-Length` upstream báo).
- Timeout fetch **10s**.
- Trả về bytes ảnh + `Content-Type` gốc; `Cache-Control: public, max-age=3600`.

### Lỗi — `400` / `401` / `403` / `413` / `415` / `424` / `502`

- `401`: chưa đăng nhập.
- `400`: thiếu/sai `url`, không resolve được host.
- `403`: host thuộc dải bị chặn (private/loopback/metadata/…) hoặc redirect trỏ tới host bị chặn.
- `413`: ảnh vượt cap 20MB (theo header hoặc theo byte thực đọc).
- `415`: response upstream không phải `image/*`.
- `424`: upstream trả lỗi `4xx`.
- `502`: fetch lỗi, upstream `5xx`, hoặc quá 3 redirect hop.

---

## 5) `POST /api/track`

Ghi **một** event analytics vào PostgreSQL (`banner_events`). Cần `DATABASE_URL` trên server. **Bắt buộc đăng nhập** Clerk (`401` nếu chưa đăng nhập). `user_id` lưu DB luôn lấy từ **session** Clerk, không tin field `user_id` trong body (nếu client gửi sẽ bị bỏ qua khi insert).

### Bắt buộc trong body

- `event` — một trong các tên đã định nghĩa trong `lib/analytics-events.ts` (ví dụ: `select_canvas`, `upload_asset`, `input_content`, `select_style`, `generate_banner`, `regenerate_banner`, `preview_banner`, `export_banner`). Event `admin_audit` chỉ được ghi từ server (dashboard users), không hợp lệ từ client track.
- `banner_id` — string.
- `timestamp` — number (Unix **ms**).

### Tùy chọn (map vào cột DB nếu đúng kiểu)

- `style`, `canvas_size` (string)
- `has_asset`, `exported` (boolean)
- `generation_time_ms`, `regenerate_count`, `cost_usd` (number)

Field khác trong JSON có thể bị bỏ qua khi insert (tùy implementation route).

### Success — `200`

```json
{ "ok": true }
```

### Lỗi

- `400`: JSON invalid; thiếu/sai một trong các trường bắt buộc: `event`, `banner_id`, `timestamp`.
- `401`: chưa đăng nhập.
- `500`: lỗi DB / thiếu cấu hình pool.

---

## 6) `GET /api/dashboard`

Tổng hợp metrics từ `banner_events` trong **khoảng thời gian** lọc. Cần `DATABASE_URL`. Yêu cầu đăng nhập và permission `**view_dashboard`** (`401` / `403` nếu không đủ).

### Query parameters


| Param   | Giá trị              | Mặc định |
| ------- | -------------------- | -------- |
| `range` | `today`, `7d`, `30d` | `7d`     |


- `today`: từ 00:00 **UTC** của ngày hiện tại đến hiện tại.
- `7d` / `30d`: sliding window theo số ngày.

### Success — `200`

```json
{
  "total_generated": 120,
  "total_previewed": 80,
  "total_exported": 35,
  "export_rate": 0.2916666666666667,
  "avg_generation_time": 12000.3,
  "total_cost": 1.234567,
  "current_period_cost": 0.12,
  "previous_period_cost": 0.09,
  "avg_tokens_per_request": 2100.5,
  "avg_input_tokens": 1800.2,
  "avg_output_tokens": 300.3,
  "total_tokens_month": 125000,
  "cost_per_gen_user": 0.012,
  "cost_per_success_image": 0.008,
  "cost_per_export_image": 0.015
}
```

- `total_generated` / `total_previewed` / `total_exported`: đếm theo `event_name` tương ứng (`generate_banner`, `preview_banner`, `export_banner`) trong range.
- `export_rate`: `total_exported / total_generated` (0 nếu không có generate).
- `avg_generation_time`: trung bình `generation_time_ms` (theo aggregate hiện tại).
- `total_cost`: tổng `cost_usd` trong range.
- `current_period_cost` / `previous_period_cost`: tổng `cost_usd` trong **24h gần nhất** vs **24h trước đó** (dùng cho so sánh trend trên UI, không nhất thiết trùng với `range`).
- Các trường token / cost-per-* phụ thuộc schema DB (nếu thiếu cột, server có thể trả `0` theo query legacy).

### Lỗi — `401` / `403` / `500`

- `401` / `403`: chưa đăng nhập hoặc không có `view_dashboard` / blocked.
- Query lỗi, DB down, sai schema, thiếu `DATABASE_URL` → `500`.

---

## 7) `GET /api/dashboard/users`

Danh sách user có hoạt động generate (và export), **phân trang**, enrich tên/email/role/block từ **Clerk**. Cần `DATABASE_URL` và `CLERK_SECRET_KEY` hợp lệ. Yêu cầu permission `**view_dashboard`** (`401` / `403`).

### Query parameters


| Param   | Mô tả                                                         |
| ------- | ------------------------------------------------------------- |
| `range` | Giống `/api/dashboard`: `today`, `7d`, `30d` (mặc định `7d`). |
| `page`  | Số trang, bắt đầu từ `1` (mặc định `1`).                      |


Kích thước trang cố định **15** user/trang (xem `PAGE_SIZE` trong code).

### Success — `200`

```json
{
  "users": [
    {
      "user_id": "user_…",
      "user_name": "Nguyen Van A",
      "email": "a@example.com",
      "role": "editor",
      "blocked": false,
      "total_generate": 42,
      "total_export": 10
    }
  ],
  "requesterRole": "admin",
  "pagination": {
    "page": 1,
    "pageSize": 15,
    "totalUsers": 100,
    "totalPages": 7
  }
}
```

- `role`: một trong `admin` | `mod` | `editor` (theo metadata Clerk + override email admin mặc định trong code).
- `blocked`: từ `privateMetadata.blocked` hoặc `publicMetadata.blocked`.
- `requesterRole`: role của user đang gọi API (tiện cho UI ẩn/hiện thao tác admin).
- Chỉ gồm user có `total_generate > 0` trong khoảng lọc.

### Lỗi — `401` / `403` / `500`

- `401` / `403`: không đủ quyền `view_dashboard`.
- Lỗi SQL hoặc cấu hình DB → `500`.

---

## 8) `PATCH` / `POST` / `DELETE` — `/api/dashboard/users`

Quản trị user qua Clerk (metadata) + ghi audit `admin_audit` vào `banner_events`. Mỗi method có permission riêng.

### `PATCH` — đổi role

- **Permission**: `manage_roles`.
- **Body**:

```json
{ "targetUserId": "user_…", "role": "editor" }
```

- `role` bắt buộc là `admin` | `mod` | `editor`.
- **Mod** không được promote user lên `**admin`** → `403`.
- **Mod** cũng không được đổi role của một user **hiện đang là `admin`** (không thể demote/reshuffle admin) — server tra role hiện tại của `targetUserId` trước khi áp dụng, trả `403` nếu actor là `mod` và target đang là `admin`.
- **Success**: `{ "ok": true }` — `200`.
- **Lỗi**: `400` (JSON/body sai), `401` / `403`, `500` (Clerk lỗi).

### `POST` — block / unblock

- **Permission**: `block_user`.
- **Body**:

```json
{ "targetUserId": "user_…", "blocked": true }
```

- **Success**: `{ "ok": true }` — `200`.
- **Lỗi**: `400`, `401` / `403`, `500`.

### `DELETE` — xóa user Clerk

- **Permission**: `delete_user`.
- **Query**: `?targetUserId=user_…` (bắt buộc).
- **Success**: `{ "ok": true }` — `200`.
- **Lỗi**: `400` (thiếu `targetUserId`), `401` / `403`, `500`.

---

## 9) `GET` / `DELETE` — `/api/sessions`

Quản lý phiên đăng nhập **của chính user đang đăng nhập** (Clerk active sessions). Không cần Postgres.

### `GET` — danh sách phiên

- **Permission**: đăng nhập Clerk (`requireUserJson`).
- **Success — `200`**:

```json
{
  "sessions": [
    {
      "sessionId": "sess_…",
      "userId": "user_…",
      "status": "active",
      "lastActiveAt": 1710000000000,
      "createdAt": 1709900000000,
      "expireAt": 1711000000000,
      "isCurrent": true,
      "deviceLabel": "Chrome 120 · macOS · Ho Chi Minh, VN",
      "browserName": "Chrome",
      "deviceType": "desktop",
      "city": "Ho Chi Minh",
      "country": "VN",
      "ipAddress": "203.0.113.1"
    }
  ]
}
```

- `isCurrent`: so với `auth().sessionId` của request (chỉ có trên `GET /api/sessions` của chính user).
- `deviceLabel`: ghép từ `latestActivity` của Clerk (browser, device, geo); fallback `"Thiết bị không xác định"`.
- Timestamp (`lastActiveAt`, `createdAt`, `expireAt`): Unix **ms** từ Clerk.

### `DELETE` — thu hồi một phiên

- **Permission**: đăng nhập.
- **Query**: `?sessionId=sess_…` (bắt buộc).
- Chỉ revoke phiên **thuộc user hiện tại** (kiểm tra qua danh sách active sessions).
- **Success — `200`**:

```json
{ "ok": true, "revokedCurrent": false }
```

- `revokedCurrent: true` khi user thu hồi phiên đang dùng — client nên redirect `/sign-in`.

### Lỗi — `400` / `401` / `403` / `500`

- `403`: `sessionId` không thuộc user hiện tại (sau khi kiểm tra danh sách active sessions).

---

## 10) `GET` / `DELETE` — `/api/dashboard/users/sessions`

Admin thu hồi phiên của user khác. Cần `CLERK_SECRET_KEY`.

### `GET` — danh sách phiên user

- **Permission**: `block_user` (admin; mod không có quyền này trong RBAC hiện tại).
- **Query**: `?targetUserId=user_…`
- **Success**: `{ "sessions": [...], "targetUserId": "user_…" }` — cùng shape `SessionListItem` như mục 9; `isCurrent` luôn `false` (admin không truyền `currentSessionId`).

### `DELETE` — thu hồi phiên user

- **Permission**: `block_user` (chỉ role **admin** trong RBAC hiện tại).
- **Query**: `?targetUserId=user_…&sessionId=sess_…`
- Ghi audit qua `logDashboardAuditEvent`: `event_name = admin_audit`, `style = session_revoke`, `canvas_size` = chuỗi chi tiết (ví dụ `sessionId=sess_…;actorRole=admin`), `user_id` = admin thực hiện, `banner_id` = `user-{targetUserId}`.
- **Success**: `{ "ok": true }` (không trả `revokedCurrent` — user bị đăng xuất ở thiết bị đó khi request tiếp theo).

### Lỗi — `400` / `401` / `403` / `500`

---

## Liên kết

- [Backend](./backend.md) — RBAC, bảo mật, tích hợp Gemini.
- [Frontend](./frontend.md) — nơi từng endpoint được gọi từ UI.
- [Workflow](./workflow.md) — env, checklist thử nghiệm.
- [Deploy](./deploy.md) — Vercel, Clerk, domain.
- [Architecture](./architecture.md) — luồng hệ thống.

