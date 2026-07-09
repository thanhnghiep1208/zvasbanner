# Frontend

Tài liệu mô tả **UI, state client, và luồng tương tác người dùng** của AI Banner Generator (Next.js App Router, React 19).

> Xem [Backend](./backend.md) cho Route Handlers/lib server, [API Reference](./api.md) cho contract từng endpoint.

## Stack UI

| Lớp | Công nghệ |
| --- | --- |
| Framework | Next.js 16 App Router, React 19, TypeScript strict |
| Style | Tailwind CSS v4, component style shadcn (`components/ui/`), Base UI (`@base-ui/react`) |
| State | Zustand (`store/editor.ts`) |
| Toast | Sonner (`components/ui/sonner.tsx`, mount trong `app/providers.tsx`) |
| Font | `next/font/google` — Inter (subset latin + vietnamese), self-hosted qua `app/layout.tsx` |
| Auth UI | `@clerk/nextjs` (`SignInButton`, `UserButton`, `<SignIn />`, `<Show>`) |

## Entry point & layout

- `app/layout.tsx` — root layout: bọc `<ClerkProvider telemetry={false}>` (đã tắt Clerk telemetry để không phải mở CSP `connect-src` cho `clerk-telemetry.com`), `<Providers>` (Tooltip + Toaster), `<Analytics />` (Vercel).
- `app/providers.tsx` — `TooltipProvider` + `Toaster` (không có theme provider — app hiện chỉ có một theme; `next-themes` là dependency chưa dùng).
- `app/(editor)/layout.tsx` + `app/(editor)/page.tsx` — route group cho trang editor chính (`/`).
- `app/dashboard/page.tsx` — trang dashboard analytics.
- `app/sign-in/[[...sign-in]]/page.tsx` — trang đăng nhập riêng (không dùng modal Clerk, tránh lỗi 409 khi redirect).
- `app/account/sessions/page.tsx` — trang quản lý phiên đăng nhập của chính user.

## Trang editor chính (`/`)

Layout 3 cột, lắp bởi `components/layout/EditorWorkspace.tsx`:

1. **Panel trái** — chọn canvas (`components/canvas/CanvasSizeSelector.tsx`) + upload asset (`components/assets/AssetPanel.tsx`, `AssetUploader.tsx` — logo/ảnh sản phẩm/nền/decoration/style-reference).
2. **Panel giữa** — `components/prompt/PromptInput.tsx`:
   - Nhập `userPrompt`, headline/sub/CTA.
   - Toggle **"Giữ nguyên chủ thể upload"** (`strictPreserveMode`).
   - `components/prompt/MarketingBriefChips.tsx` — chip chọn **campaign intent** (`flash-sale` | `product-launch` | `brand-awareness` | `event`) và **focal subject** (`product` | `person` | `text` | `scene`); optional, inject phrase vào prompt server (`lib/prompt-builder.ts`) và gợi ý style (`lib/style-suggestions.ts`) — không tự override style user đã chọn.
   - `components/prompt/StyleControls.tsx` — style/mood/color palette/font/background.
   - Nút **Cải thiện prompt** (`POST /api/enhance-prompt`) và **Tạo banner** (`POST /api/generate`).
   - Logic gọi API tách trong `components/prompt/prompt-input/use-prompt-input-actions.ts`; lỗi enhance phân loại qua `enhance-errors.ts`.
   - Hộp status sau generate: model, thời gian (giây, chỉ tính lần generate đầu), token usage, badge **「Đã tinh chỉnh hòa hợp」** khi `meta.harmonyApplied === true`.
3. **Panel phải** — `components/canvas/CanvasArea.tsx`: preview banner kết quả; tab **Biến thể kích thước** (`AdditionalCanvasSizesPanel.tsx` + `PresetAspectShape.tsx` cho icon tỉ lệ preset); `GeneratedImageEditBar.tsx` cho chỉnh sửa ảnh đã tạo (`POST /api/edit-image`, logic trong `use-generated-image-edit.ts`).
4. **Export** — `components/layout/ExportPopover.tsx`: chọn định dạng PNG/JPG, quality, scale 1x/2x; export qua Canvas API (`lib/export.ts`), không chèn watermark logo.
5. **Toolbar** (`components/layout/Toolbar.tsx`) — link **Phiên** → `/account/sessions` (chỉ hiện khi signed-in), icon **Dashboard** → `/dashboard`.

Các route/action yêu cầu **đăng nhập Clerk** (gate `<Show>` signed-in/signed-out); khi chưa đăng nhập, UI hiện hướng dẫn sign-in thay vì canvas.

## State (Zustand — `store/editor.ts`)

`useEditorStore` giữ toàn bộ state editor phía client:

- Canvas: `canvasConfig`, preset đang chọn.
- Assets: danh sách `UploadedAsset[]` (kèm `dataUrl` để gửi multimodal).
- Prompt/style: `userPrompt`, `styleControls`, `marketingBrief`.
- Generation: `generatedImage`, `generationProgress` (`GenerationProgress`/`VariationProgressStatus`), `generationStats` (`GenerationStats` — model, elapsedMs, token, `harmonyApplied`).
- `currentBannerId` — id dùng để nhóm các event analytics (`preview_banner` chỉ track một lần theo id này).

State không persist (reload mất draft) — không có middleware `persist` trong store hiện tại.

## Dashboard (`/dashboard`)

- Client component; đợi **hydrate** xong mới rẽ nhánh theo trạng thái signed-in/out (tránh cảnh báo hydration mismatch với Clerk).
- `components/dashboard/TimeRangeFilter.tsx` — lọc `today` / `7d` / `30d`.
- `components/dashboard/UserAnalyticsTable.tsx` — bảng Top Users (badge role, thao tác đổi role/block/xóa theo quyền của người xem).
- `components/dashboard/UserSessionsDialog.tsx` — admin xem/thu hồi phiên của user khác (nút **Phiên** trong bảng).
- Poll định kỳ (mặc định mỗi 4 giờ — xem `DASHBOARD_AGGREGATE_POLL_MS` trong `lib/dashboard.ts`) khi đã đăng nhập; nút **Làm mới** gọi lại với `refresh=1` để bypass cache server.
- API tương ứng: `GET /api/dashboard`, `GET/PATCH/POST/DELETE /api/dashboard/users`, `GET/DELETE /api/dashboard/users/sessions` — xem [API Reference](./api.md).

## Quản lý phiên (`/account/sessions`)

- `components/account/SessionsPanel.tsx` — liệt kê phiên Clerk active của chính user (`GET /api/sessions`), đăng xuất từng phiên (`DELETE /api/sessions?sessionId=…`).
- Thu hồi phiên **đang dùng** (`revokedCurrent: true`) → panel redirect `/sign-in`.

## Analytics client

- `lib/analytics.ts` — hàm `track()` type-safe theo `lib/analytics-events.ts`, gửi `POST /api/track` (tự thêm `banner_id`, `timestamp`; server luôn lấy `user_id` từ session Clerk, không tin field client gửi).
- Event chính: `select_canvas`, `upload_asset`, `input_content`, `select_style`, `generate_banner`, `regenerate_banner`, `preview_banner`, `export_banner`.

## Gọi API & proxy ảnh

- Toàn bộ `fetch` gọi Route Handlers **cùng origin** (`/api/...`) — không có client nào gọi trực tiếp Gemini hoặc domain ngoài.
- Ảnh remote (ví dụ URL upload cũ) được tải qua `GET /api/proxy-image?url=...` (`lib/export.ts`, `lib/reference-image-data-url.ts`) để tránh CORS taint khi vẽ lên `<canvas>`; endpoint này yêu cầu đăng nhập và có kiểm tra chống SSRF phía server (xem [Backend](./backend.md#bảo-mật)).

## Content Security Policy — ảnh hưởng tới frontend

`next.config.mjs` set CSP giới hạn `script-src`/`connect-src`/`img-src` về `'self'` + domain Clerk/Cloudflare Turnstile/Vercel Analytics (xem [Backend](./backend.md#bảo-mật)). Khi thêm một dependency client mới gọi ra domain ngoài (script, fetch, ảnh, iframe), **phải** thêm domain đó vào CSP tương ứng trong `next.config.mjs`, nếu không request sẽ bị browser chặn im lặng (console báo lỗi CSP, không phải lỗi network).

## Liên kết

- [Backend](./backend.md)
- [API Reference](./api.md)
- [Architecture](./architecture.md)
- [Workflow](./workflow.md)
