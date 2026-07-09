# Workflow — cài đặt & quy trình phát triển

Tài liệu tập trung vào **cài đặt local, biến môi trường, luồng làm việc, và checklist thử nghiệm**. Cấu trúc code chi tiết xem [Frontend](./frontend.md) / [Backend](./backend.md); contract từng endpoint xem [API Reference](./api.md); **triển khai production** xem [Deploy](./deploy.md).

## Yêu cầu môi trường

- **Node.js** ≥ `20.9.0` (đồng bộ với `package.json` → `engines`)
- **npm** (hoặc tương đương)
- Tài khoản [Google AI Studio](https://aistudio.google.com/) hoặc API key Gemini hợp lệ
- **Clerk** — khuyến nghị cho đăng nhập production (có thể dùng instance dev khi làm local)
- **PostgreSQL** — tùy chọn cho dev thuần UI; **bắt buộc** nếu cần `/api/track`, `/api/dashboard`, `/api/dashboard/users`

## Cài đặt

```bash
npm install
```

## Phân tách cấu hình: Frontend vs Backend

Cùng một repo Next.js, nhưng **biến môi trường và ranh giới thực thi** khác nhau (cấu trúc code chi tiết: [Frontend](./frontend.md), [Backend](./backend.md)).

### Frontend (trình duyệt)

- Chạy trong browser: React components, Zustand, `fetch` tới `/api/`*.
- Chỉ đọc được biến có tiền tố **`NEXT_PUBLIC_`** (embed vào bundle lúc build).
- **Clerk**: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — dùng cho SDK phía client (nút đăng nhập, session). Biến này cũng được `next.config.mjs` đọc lúc build để tự tính domain Clerk cho CSP — thiếu/sai key thì cả login **và** CSP đều sai.
- **Gọi API**: không gắn `GEMINI_API_KEY` trên client; mọi gọi Gemini đi qua Route Handlers.
- **Font / UI**: Inter qua `next/font` trong `app/layout.tsx`; Tailwind + component trong `components/`.

### Backend (server — Route Handlers & middleware)

- File trong `app/api/**/route.ts` và middleware `proxy.ts` chạy trên Node.
- **`GEMINI_API_KEY`**: chỉ server; dùng cho `@google/generative-ai` (generate, enhance, edit-image).
- **`CLERK_SECRET_KEY`**: chỉ server; xác thực session / gọi Clerk Backend API (ví dụ enrich user trên dashboard).
- **`DATABASE_URL`**: chỉ server; `pg` pool cho analytics.
- **`ADMIN_EMAIL`** (tùy chọn): chỉ server; email primary luôn được coi là `admin` (xem [Backend § RBAC](./backend.md#rbac-libauthzts-librequire-userts)). Ưu tiên set role qua Clerk Dashboard metadata; chỉ dùng biến này khi cần override nhanh.
- **`proxy.ts`**: export `clerkMiddleware()` — bảo vệ / đồng bộ auth theo khuyến nghị Clerk cho App Router.

## Cấu hình file `.env.local`

Tạo file **`.env.local`** ở thư mục gốc project (copy từ `.env.local.example`). **Không** commit (đã có trong `.gitignore`).

### Biến bắt buộc (tạo ảnh / cải thiện prompt / chỉnh sửa ảnh)

| Biến | Mô tả |
| --- | --- |
| `GEMINI_API_KEY` | Key server cho `@google/generative-ai` — dùng cho `POST /api/generate`, `POST /api/enhance-prompt`, `POST /api/edit-image`. |

### Biến Clerk (đăng nhập)

| Biến | Phạm vi | Mô tả |
| --- | --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Client + build | Publishable key. |
| `CLERK_SECRET_KEY` | Server only | Secret key. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Client | `/sign-in` (trang đăng nhập riêng, tránh modal 409). |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Client | `/` sau khi sign-in. |

Lấy key tại [Clerk Dashboard](https://dashboard.clerk.com/) → **API Keys**.
Production: tạo **Production instance**, copy key production vào biến môi trường trên host (Vercel). Development keys có giới hạn — không dùng cho site public.

### Clerk: đăng nhập username + password (không Google)

App **không** gọi Google OAuth trong code — form đăng nhập là `<SignIn />` (`/sign-in`), chiến lược auth lấy từ **Clerk Dashboard**.

**Cấu hình Clerk Dashboard** (Development và Production giống nhau):

1. **User & authentication** → **Email, phone, username** (hoặc tương đương):
   - Bật **Username** (sign-in + sign-up nếu cần).
   - Bật **Password**.
   - Tắt hoặc không bắt buộc **Email** nếu chỉ dùng username (tùy policy nội bộ).
2. **User & authentication** → **Social connections**:
   - **Tắt Google** (và mọi OAuth khác nếu không dùng).
3. **Restrictions** (khuyến nghị nội bộ):
   - **Disable sign-ups** — chỉ admin tạo user trong Dashboard.
4. **Users** → **Create user**:
   - Nhập **Username** + **Password** cho từng người.
   - Gán `privateMetadata.role`: `admin` | `mod` | `editor` (mặc định app coi là `editor` nếu thiếu).
   - Chỉ cần set email khớp `ADMIN_EMAIL` nếu muốn dùng cơ chế override thay vì set `role` trực tiếp trong metadata.

**Sau khi đổi từ Google sang username/password** (một lần trên mỗi trình duyệt):

- Xóa cookie `localhost` và `*.clerk.accounts.dev`, hoặc bấm **Xóa phiên & thử lại** trên `/sign-in`.
- Đăng nhập bằng **username** (không nhầm email Google cũ).
- Nếu Network → `sign_ins` → `errors[0].code` = `form_identifier_not_found`: user chưa được tạo trong Clerk hoặc sai username.

**Lỗi UI: "The authentication settings are invalid."** (`errors[0].code` = `user_settings_invalid`, HTTP 409):

Clerk chặn `sign_ins` vì **không còn cách đăng nhập hợp lệ** trên instance — thường do tắt Google mà **chưa bật đủ Username + Password** (hoặc tắt hết Email/Username/Password/SSO).

Checklist bắt buộc trong Clerk Dashboard:

| Cài đặt | Trạng thái |
| --- | --- |
| User & authentication → **Username** (sign-in) | Bật |
| User & authentication → **Password** | Bật |
| User & authentication → **Email** | Nên bật (user có email trong Clerk; cần nếu dùng `ADMIN_EMAIL`) |
| SSO connections → **Google** | Tắt (nếu không dùng OAuth) |
| Users → user đã tạo | Username + password (+ email) |

Sau khi lưu Dashboard: đợi ~1 phút, hard reload `/sign-in`. Code app **không** sửa được lỗi này — chỉ sửa cấu hình Clerk.

### Biến PostgreSQL (analytics)

| Biến | Mô tả |
| --- | --- |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL, ví dụ `postgresql://user:pass@host:5432/dbname?sslmode=require`. |

- Lấy từ nhà cung cấp: [Neon](https://neon.tech/), [Supabase](https://supabase.com/), RDS, v.v.
- Nếu mật khẩu hoặc URL có ký tự đặc biệt (`&`, `#`, `@`, …), hãy **URL-encode** hoặc bọc toàn bộ giá trị trong **dấu nháy đơn** trong `.env.local`, ví dụ: `DATABASE_URL='postgresql://...'`.

### Ví dụ `.env.local` đầy đủ

```bash
GEMINI_API_KEY=your_gemini_key

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/

DATABASE_URL='postgresql://user:pass@host:5432/dbname?sslmode=require'

# Tùy chọn — override admin theo email (ưu tiên set role qua Clerk Dashboard metadata)
# ADMIN_EMAIL=you@example.com
```

## Migration analytics (PostgreSQL)

Sau khi có `DATABASE_URL` hợp lệ:

```bash
set -a && source .env.local && set +a
psql "$DATABASE_URL" -f db/banner_events.sql
```

Nếu bảng/index đã tồn tại, Postgres có thể báo `already exists, skipping` — vẫn coi là thành công.

Index composite cho dashboard (`idx_banner_events_ts_event`, `idx_banner_events_ts_user`) nằm trong cùng file; lần gọi `ensureAnalyticsSchemaReady` (track/dashboard) cũng tạo index nếu thiếu.

Kiểm tra nhanh:

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM banner_events;"
```

## Luồng làm việc (workflow) — từ góc nhìn sản phẩm

1. **Đăng nhập** (Clerk) — các thao tác tạo banner chính yêu cầu user đã sign in. Có thể đăng nhập **nhiều thiết bị/trình duyệt** cùng lúc (mỗi nơi một session Clerk).
2. **(Tùy chọn) Quản lý phiên** — `/account/sessions` hoặc link **Phiên** trên toolbar: xem thiết bị đang đăng nhập, đăng xuất phiên khác (`DELETE /api/sessions?sessionId=…`).
3. **Chọn canvas** — preset (ví dụ Zalo OA Img, MP3 Home) hoặc custom; state trong Zustand.
4. **Upload asset** — ảnh sản phẩm / logo / ảnh tham chiếu style; chuẩn bị data URL gửi kèm generate.
5. **Nhập nội dung** — prompt chính, headline, sub, CTA; tùy chọn "Giữ nguyên chủ thể upload" (strict preserve), tùy chọn chip **campaign intent / focal subject** (`MarketingBriefChips`).
6. **(Tùy chọn) Cải thiện prompt** — `POST /api/enhance-prompt` cập nhật text prompt.
7. **Tạo banner** — `POST /api/generate`; prompt server gồm cohesion instructions (`buildCohesionInstructions`); sau generate Gemini thành công server chạy **harmony pass** ngầm (tối đa ~30s, best-effort). Hiển thị tiến trình / lỗi có mã; lưu ảnh + stats (model, thời gian, token, cost, `harmonyApplied`). Badge **「Đã tinh chỉnh hòa hợp」** trong `PromptInput` khi `harmonyApplied === true`.
8. **Preview** — hiển thị ảnh trong canvas; có thể ghi nhận analytics preview theo `banner_id`.
9. **(Tùy chọn) Tab Biến thể kích thước** — chọn preset khác (có icon silhouette tỉ lệ `PresetAspectShape`); tạo preview/download theo từng kích thước (flash model, layout adaptation).
10. **(Tùy chọn) Chỉnh sửa ảnh đã tạo** — `POST /api/edit-image` với `imageDataUrl` + `editPrompt` (điều chỉnh nhẹ, không tạo mới hoàn toàn).
11. **Xuất file** — export PNG/JPG qua Canvas API; có thể dùng `GET /api/proxy-image` nếu cần tải ảnh remote (yêu cầu đăng nhập).
12. **Analytics** — `track(...)` gửi sự kiện tới `POST /api/track` (generate, preview, export, …).

## Dashboard analytics

- URL local: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- **Đăng nhập**: trang dashboard hiển thị CTA **Login** khi chưa sign-in; sau khi đăng nhập, API vẫn trả **403** nếu role không có quyền `view_dashboard`.
- Dữ liệu: `GET /api/dashboard` (metrics) và `GET /api/dashboard/users` (phân trang). Query `range` (`today`, `7d`, `30d`); users thêm `page`. Gộp lần tải đầu: `GET /api/dashboard?includeUsers=1&usersPage=1`. Bỏ qua cache server: `refresh=1` (nút **Làm mới**). Các thao tác quản trị user: `PATCH` / `POST` / `DELETE` trên `/api/dashboard/users`.
- Cache server: aggregate metrics ~30 phút (`DASHBOARD_AGGREGATE_CACHE_MS`); lookup role/block Clerk **60 giây** (`USER_ACCESS_CACHE_MS`, xóa cache khi đổi role/block/xóa user).
- Trang client **poll** định kỳ (mặc định tối đa mỗi 4 giờ, `DASHBOARD_AGGREGATE_POLL_MS`; có nút **Làm mới** với `refresh=1`) khi user đã đăng nhập; cần có event thật trong app thì số liệu mới tăng.
- **Hydration**: trang dashboard dùng cờ hydrate client trước khi phân nhánh auth để giảm cảnh báo mismatch; nếu vẫn thấy attribute lạ (ví dụ `bis_skin_checked`), thường do extension trình duyệt — xem mục troubleshooting.

### RBAC (vai trò & Clerk metadata)

- File tham chiếu: `lib/authz.ts`, `lib/require-user.ts` — chi tiết đầy đủ: [Backend § RBAC](./backend.md#rbac-libauthzts-librequire-userts).
- Role: `admin`, `mod`, `editor` (mặc định khi không set metadata: **editor**).
- Gợi ý lưu trên user trong Clerk Dashboard: `privateMetadata.role` (string), tùy chọn `privateMetadata.blocked` (boolean). Có thể mirror sang `publicMetadata` nếu cần đọc phía client — server vẫn ưu tiên đọc nhất quán trong `getUserAccessByUserId`.
- **Admin override**: nếu set env `ADMIN_EMAIL`, primary email khớp luôn được coi là `admin` — không hardcode email trong code.
- **Mod** không được gán role `admin` cho user khác, và **không được sửa role của một admin hiện có** (không thể promote lẫn demote) — API trả 403.
- Permission tóm tắt:
  - `view_dashboard`: xem dashboard + danh sách users
  - `manage_roles`: đổi role (UI dropdown)
  - `block_user`: block/unblock; **xem/thu hồi phiên user** (`/api/dashboard/users/sessions`) — chỉ **admin**
  - `delete_user`: xóa user Clerk
  - `generate_image`: generate, enhance prompt, edit image

## Chạy local

```bash
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000).

## Build production (kiểm tra trước khi deploy)

```bash
npm run build
npm run start
```

## Lint / type-check

```bash
npm run lint
npx tsc --noEmit
```

## Triển khai (deploy)

Hướng dẫn chi tiết: checklist **Vercel + Clerk + domain + Postgres**, cấu hình DNS, biến môi trường production và xử lý sự cố — xem **[Deploy](./deploy.md)**.

## Quy ước phát triển

- Model tạo ảnh trên UI chính: user chọn **Nano Banana Pro** (`gemini-3-pro-image-preview`) hoặc **Nano Banana 2** (`gemini-3.1-flash-image-preview`); tab **Biến thể kích thước** luôn dùng flash.
- Prompt generate: `lib/prompt-builder.ts` — `buildCohesionInstructions()` trong creative layer; harmony pass server: `runHarmonyPass` / `HARMONY_EDIT_PROMPT` (`lib/gemini-server.ts`).
- Client timeout generate: **92s** (khớp server `maxDuration` 90s + buffer); không rút xuống khi đã bật harmony pass.
- Ưu tiên **giữ trung thực asset** user upload khi generate.
- Khi generate thất bại có placeholder: phản hồi phải gồm `failedStep` + `placeholderError` (message thân thiện, không leak raw error) để UI báo rõ bước lỗi.
- `meta.harmonyApplied`: chỉ meaningful khi `source === "gemini"`; không expose harmony như API/tính năng riêng trên UI.
- Export: không chèn thêm watermark logo (logo đã có trong thiết kế thì do user/model).
- Endpoint nào nhận input từ client hoặc gọi ra ngoài (fetch domain khác) đều cần qua gate auth + validate — xem checklist bảo mật trong [Backend § Bảo mật](./backend.md#bảo-mật) trước khi thêm route mới.
- Thêm domain ngoài mới ở client (script/fetch/ảnh/iframe) → phải cập nhật CSP trong `next.config.mjs`, nếu không sẽ bị browser chặn im lặng.

## Checklist thử nghiệm thủ công

1. Upload asset, bật/tắt "Giữ nguyên chủ thể upload".
2. Tạo ảnh và kiểm tra preview + hộp stats (model, thời gian, token); khi harmony thành công thấy badge **「Đã tinh chỉnh hòa hợp」**.
3. Tab **Biến thể kích thước**: preset hiển thị icon tỉ lệ; tạo ít nhất một biến thể từ banner gốc.
4. Thử lỗi (timeout / quota) và xác nhận thông báo có mã lỗi ngắn, **không** hiện raw error kỹ thuật.
5. Chỉnh sửa ảnh đã tạo qua `edit-image`.
6. Export PNG/JPG; xác nhận không bị chèn watermark thêm.
7. **Đa phiên / quản lý phiên**:
   - Đăng nhập cùng user trên **hai trình duyệt** (hoặc Chrome + Firefox); cả hai đều generate được.
   - Mở `/account/sessions` (hoặc link **Phiên** trên toolbar): thấy ≥ 2 phiên active; một phiên có badge "Phiên hiện tại".
   - **Đăng xuất phiên khác** từ trình duyệt A → trình duyệt B bị 401 khi gọi API; A vẫn dùng bình thường.
   - Admin: dashboard → Top Users → **Phiên** → thu hồi phiên user → user đó bị đăng xuất trên thiết bị tương ứng.
   - User bị `blocked` vẫn không gọi được `/api/generate` (403).
8. **RBAC — bảo vệ admin**: đăng nhập là `mod`, thử `PATCH /api/dashboard/users` đổi role của một user đang là `admin` → phải nhận `403` (cả promote lẫn demote).
9. **Rate limit / size cap** (tùy chọn, để xác nhận sau khi đổi `lib/request-limits.ts`): gọi `/api/generate` quá 20 lần/giờ → `429`; gửi body vượt cap → `413`.
10. **Console không có lỗi CSP**: mở DevTools khi dùng app (đăng nhập, generate, mở dashboard) — không thấy dòng `Refused to connect/load because it violates the following Content Security Policy directive`.

## Xử lý sự cố (troubleshooting)

- **Hydration / `bis_skin_checked`**: thường do extension trình duyệt (ví dụ Bitwarden). Tắt extension trên `localhost` hoặc dùng profile sạch.
- **Chỉ thấy placeholder khi generate**: đọc thông báo lỗi trên UI; kiểm tra `GEMINI_API_KEY`, quota, và log server (raw error nằm trong log, không còn hiện trên UI).
- **`source .env.local` lỗi `parse error near '&'`**: bọc `DATABASE_URL` trong `'...'`.
- **`psql: command not found`**: cài client PostgreSQL (ví dụ `brew install libpq`) hoặc dùng SQL editor trên dashboard DB.
- **Socket Postgres local failed**: `DATABASE_URL` đang trỏ localhost nhưng server không chạy — dùng URL remote đầy đủ.
- **Dashboard trả 500 / không có dữ liệu**: kiểm tra `DATABASE_URL` trên Vercel và đã chạy migration.
- **Clerk `Development keys` warning**: bình thường khi dùng `pk_test_` / `sk_test_` trên local. Production trên Vercel phải dùng key **Production** (`pk_live_` / `sk_live_`) từ Clerk instance Production.
- **Clerk `POST .../sign_ins` 409 (Conflict)**: xem `errors[0].code` trong Network → Response. `user_settings_invalid` = "The authentication settings are invalid." → bật **Username + Password** trong Clerk Dashboard (xem bảng checklist mục Clerk username/password). `session_exists` = đã login — mở `/`. `form_identifier_not_found` = sai username hoặc user chưa tạo. Sau khi đổi từ Google: xóa cookie + đăng nhập bằng username.
- **Thu hồi phiên hiện tại**: sau `DELETE /api/sessions?sessionId=…` với `revokedCurrent: true`, `SessionsPanel` redirect `/sign-in`. Phiên khác bị revoke sẽ nhận `401` ở API protected ở lần gọi tiếp theo.
- **Console báo lỗi CSP (`Refused to connect/load`)**: domain mới chưa có trong `next.config.mjs` (`csp`) — xem [Backend § Bảo mật](./backend.md#bảo-mật) và [Deploy § CSP](./deploy.md#41-environment-variables-production) trước khi thêm.
- **429 khi test nhiều lần liên tục**: rate limit 20 req/giờ/user trên `generate`/`edit-image`/`enhance-prompt` là **per-instance** — restart dev server hoặc đợi hết cửa sổ 1 giờ để reset (không cần đổi code).

## Tài liệu liên quan

- [Frontend](./frontend.md)
- [Backend](./backend.md)
- [Architecture](./architecture.md)
- [API Reference](./api.md)
- [Deploy](./deploy.md)
- [README](../README.md)
