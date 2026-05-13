# Kiến trúc ứng dụng

Tài liệu mô tả **cách các phần frontend, backend, AI và analytics kết nối** trong dự án AI Banner Generator (Next.js App Router).

## Tổng quan

Ứng dụng là một **monolith Next.js**: UI và Route Handlers (API) nằm chung một repo, deploy một service. Người dùng tạo banner bằng prompt đa phương tiện (text + ảnh upload); server gọi **Google Gemini**; sự kiện hành vi được ghi qua **POST /api/track** xuống **PostgreSQL** để dashboard tổng hợp.

## Công nghệ chính


| Lớp          | Công nghệ                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework    | Next.js 16 (App Router), React 19, TypeScript (strict)                                                                                                                                  |
| UI           | Tailwind CSS v4, shadcn-style components, Sonner (toast)                                                                                                                                |
| Font         | `next/font` — Inter (latin + vietnamese)                                                                                                                                                |
| State client | Zustand (`store/editor.ts`)                                                                                                                                                             |
| Auth         | Clerk (`@clerk/nextjs`), middleware `proxy.ts`                                                                                                                                          |
| AI           | `@google/generative-ai`; model ảnh theo lựa chọn: `gemini-3-pro-image-preview` (Nano Banana Pro) hoặc `gemini-3.1-flash-image-preview` (Nano Banana 2); tab biến thể cố định dùng flash |
| Analytics DB | `pg`, bảng `banner_events` (xem `db/banner_events.sql`)                                                                                                                                 |
| Deploy gợi ý | Vercel + Postgres hosted (Neon, Supabase, …)                                                                                                                                            |


## Cấu trúc thư mục (rút gọn)

- `**app/`** — Trang (`page.tsx`), layout, Route Handlers dưới `app/api/` (các file `route.ts`).
- `**components/`** — UI theo vùng: `canvas/`, `layout/`, `prompt/`, `dashboard/`, `ui/`.
- `**lib/`** — Logic dùng chung: `gemini-server.ts`, `client-generation.ts`, `analytics.ts`, `authz.ts`, `require-user.ts`, `db.ts`, `validate-generation.ts`, presets canvas.
- `**store/`** — Zustand: prompt, canvas, assets, ảnh đã tạo, `currentBannerId` (analytics).
- `**proxy.ts`** — `clerkMiddleware()` (Clerk khuyến nghị cho Next.js; file tên `proxy.ts` thay vì `middleware.ts` trong setup này).
- `**docs/`** — Hướng dẫn dev, API, kiến trúc.

## Frontend (FE)

- **Entry**: `app/layout.tsx` bọc `ClerkProvider`, `Providers` (theme/toast), font Inter.
- **Trang chính**: editor workspace — chọn kích thước canvas, upload asset, nhập headline/sub/CTA, style controls, nút cải thiện prompt và tạo banner.
- **Điều kiện hiển thị**: một số vùng (canvas / tạo banner) chỉ bật khi **đã đăng nhập** Clerk; khi chưa đăng nhập hiển thị hướng dẫn sign in.
- **Toolbar** (`components/layout/Toolbar.tsx`): icon **Dashboard** dẫn tới `/dashboard` (không dùng `asChild` trên `Button` — component dùng Base UI, style link qua `buttonVariants`).
- **Gọi API**: `fetch` tới Route Handlers cùng origin (`/api/generate`, `/api/enhance-prompt`, `/api/edit-image`, `/api/proxy-image`, `/api/track`).
- **Export**: Canvas API trên trình duyệt, có thể tải ảnh qua proxy để tránh CORS; **không** chèn watermark logo khi xuất (logo đã nằm trong banner nếu user thiết kế vậy).
- **Analytics client**: hàm `track()` (`lib/analytics.ts`) gửi payload type-safe tới `POST /api/track` (kèm `user_id` từ Clerk khi có).

## Backend (BE)

- **Route Handlers** chạy trên server Node, đọc biến môi trường **chỉ server** (`GEMINI_API_KEY`, `CLERK_SECRET_KEY`, `DATABASE_URL`).
- **RBAC**: `lib/authz.ts` định nghĩa role `admin` | `mod` | `editor` và permission; `lib/require-user.ts` có `requirePermissionJson()` để chặn user chưa đăng nhập, user **blocked**, hoặc thiếu quyền (403 JSON).
- **Generate** (`/api/generate`): cần permission `generate_image`; validate body (gồm `imageModel`: `nano-banana-pro` | `nano-banana-2`), ghép prompt đầy đủ, gọi Gemini multimodal; trả ảnh base64/data URL hoặc placeholder + `failedStep` / `placeholderError` khi lỗi.
- **Enhance** (`/api/enhance-prompt`): cần `generate_image`; meta-prompt viết lại `userPrompt`.
- **Edit image** (`/api/edit-image`): cần `generate_image`; nhận `imageDataUrl` + `editPrompt`, chỉnh sửa nhẹ trên ảnh đã tạo (vị trí, góc, màu cơ bản), không tạo composition mới từ đầu.
- **Proxy ảnh** (`/api/proxy-image`): stream ảnh remote, giảm rủi ro SSRF bằng validate URL.
- **Track** (`/api/track`): insert một dòng vào `banner_events`.
- **Dashboard** (`GET /api/dashboard`, `GET/PATCH/POST/DELETE /api/dashboard/users`): aggregate SQL theo khoảng thời gian; users enrich tên/email + **role** / **blocked** từ Clerk metadata; hành động admin (đổi role, block, xóa user) ghi **audit** vào `banner_events` với `event_name = admin_audit` (chi tiết trong các cột map sẵn của bảng).

## Luồng tạo ảnh (high level)

1. Client thu thập `canvasConfig`, `assets` (data URL), `userPrompt`, `styleControls`, v.v.
2. `POST /api/generate` → server gọi `geminiGenerateOneImage` với parts text + image.
3. Phản hồi thành công: một `image` (data URL) + `meta` (model, thời gian, token, cost ước lượng).
4. Client cập nhật Zustand, hiển thị preview; có thể `track('generate_banner', …)`.
5. Khi preview hiển thị, có thể `track('preview_banner', …)` (một lần theo `currentBannerId`).
6. Tùy chọn: user nhập prompt chỉnh sửa → `POST /api/edit-image` → cập nhật ảnh trong store.
7. Export file → `track('export_banner', …)`.

## Auth (Clerk)

- **Middleware** (`proxy.ts`): matcher áp dụng cho các route UI và `/api`, theo cấu hình Clerk.
- **Client**: `SignInButton`, `SignUpButton`, `UserButton`, `Show` (signed-in / signed-out); trang `/dashboard` khi chưa đăng nhập hiển thị CTA **Login** (modal).
- **Server**: `auth()` / `clerkClient()` dùng ở các route cần identity; **role** lưu trong `privateMetadata.role` hoặc `publicMetadata.role` (giá trị: `admin` | `mod` | `editor`); **blocked** trong `privateMetadata.blocked` hoặc `publicMetadata.blocked` (boolean). Email `thanhnghiep1208@gmail.com` luôn được coi là **admin** (override trong `lib/authz.ts`). **Mod** không được promote user lên `admin` (server trả 403).

## Analytics & Dashboard

- Mọi event chuẩn hóa tên trong `lib/analytics-events.ts`; `track()` đảm bảo type an toàn theo từng event.
- **Persistence**: `POST /api/track` ghi vào PostgreSQL; không có `DATABASE_URL` thì endpoint này (và dashboard) sẽ lỗi khi gọi.
- **Dashboard UI** (`/dashboard`): client component; sau khi **hydrate** client mới phân nhánh signed-in (tránh hydration mismatch với Clerk); polling định kỳ khi đã đăng nhập; lọc **Today / 7 ngày / 30 ngày** (query `range`); layout ưu tiên **ít viền lồng nhau**, section rõ; bảng Top Users (role badge màu, quản trị theo quyền).

## Mô hình AI

- **Generate (chọn được)**: `nano-banana-pro` → `gemini-3-pro-image-preview`; `nano-banana-2` → `gemini-3.1-flash-image-preview` (mặc định Pro trên UI chính).
- **Biến thể kích thước** (tab riêng): luôn dùng **Nano Banana 2** (flash) + chế độ giữ layout/copy chặt hơn; có thể auto-retry một lần khi lỗi/placeholder.
- **Enhance / edit-image**: dùng model text/image theo implementation hiện tại trong `lib/gemini-server.ts` (xem code khi đổi model).
- Timeout tách: enhance ngắn hơn; generate ảnh timeout dài hơn (vài chục giây); client có mã lỗi riêng khi timeout (ví dụ `[E-GEN-CLIENT-TIMEOUT]`).
- Xử lý **503 high demand** Gemini: thông điệp riêng (không gộp chung quota) — xem `normalizeGenerationError` trong `app/api/generate/route.ts`.

## Tài liệu liên quan

- [Development Guide](./development-guide.md) — cấu hình env, workflow chi tiết.
- [Deploy](./deploy.md) — Vercel, Clerk, domain, Postgres production.
- [API Reference](./api.md) — contract từng endpoint.

