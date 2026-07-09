# Kiến trúc hệ thống

Tài liệu tổng quan (birds-eye view) cho AI Banner Generator. Chi tiết theo từng lớp xem các doc liên kết ở cuối trang.

## Tổng quan

Ứng dụng là một **monolith Next.js** (App Router): UI và Route Handlers (API) nằm chung một repo, deploy một service duy nhất trên Vercel. Người dùng tạo banner bằng prompt đa phương tiện (text + ảnh upload); server gọi **Google Gemini**; sự kiện hành vi được ghi qua `POST /api/track` xuống **PostgreSQL** để dashboard tổng hợp. Auth qua **Clerk**.

```
Browser (React 19)
  │  fetch cùng-origin, không gọi trực tiếp Gemini/DB
  ▼
Next.js Route Handlers (app/api/**)  ──auth──▶  Clerk (session, RBAC metadata)
  │                    │
  │ Gemini SDK          └─▶ PostgreSQL (banner_events) — analytics/dashboard
  ▼
Google Gemini API (generate / enhance / edit / harmony pass)
```

## Công nghệ chính

| Lớp | Công nghệ |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript strict |
| UI | Tailwind CSS v4, shadcn-style components, Base UI, Sonner (toast) |
| State client | Zustand (`store/editor.ts`) |
| Auth | Clerk (`@clerk/nextjs`), middleware `proxy.ts` |
| AI | `@google/generative-ai`; model ảnh theo lựa chọn: `gemini-3-pro-image-preview` (Nano Banana Pro) hoặc `gemini-3.1-flash-image-preview` (Nano Banana 2) |
| Analytics DB | `pg`, bảng `banner_events` (`db/banner_events.sql`) |
| Deploy | Vercel + Postgres hosted (Neon, Supabase, …) |

## Cấu trúc thư mục (rút gọn)

- **`app/`** — Trang (`page.tsx`), layout, Route Handlers dưới `app/api/**/route.ts`.
- **`components/`** — UI theo vùng: `canvas/`, `layout/`, `prompt/`, `dashboard/`, `account/`, `auth/`, `assets/`, `results/`, `ui/`.
- **`lib/`** — Logic dùng chung: `gemini-server.ts`, `prompt-builder.ts`, `client-generation.ts`, `analytics.ts`, `authz.ts`, `require-user.ts`, `request-limits.ts`, `clerk-sessions.ts`, `dashboard*.ts`, `db.ts`, `validate-generation.ts`, presets canvas.
- **`store/`** — Zustand: canvas config, assets, prompt/style, ảnh đã tạo, `currentBannerId` (analytics).
- **`proxy.ts`** — export `clerkMiddleware()` (Next.js 16 dùng tên file `proxy.ts` thay cho `middleware.ts`).
- **`docs/`** — tài liệu dự án (file này + frontend/backend/api/deploy/workflow).

## Luồng tạo ảnh (high level)

1. Client thu thập `canvasConfig`, `assets` (kèm data URL), `userPrompt`, `styleControls`, `marketingBrief`.
2. `POST /api/generate` → server validate + ghép prompt (`assembleFullPrompt`, gồm `buildCohesionInstructions`) → gọi Gemini multimodal theo `imageModel`.
3. Nếu Gemini OK: chạy ngầm `runHarmonyPass` (chỉnh cohesion, best-effort, timeout riêng ~30s).
4. Trả `{ image, source, meta }` (`meta.harmonyApplied`) khi thành công, hoặc ảnh placeholder + `failedStep`/`placeholderError` khi lỗi.
5. Client cập nhật Zustand, hiển thị preview + status box; có thể `track(...)` sự kiện.
6. Tuỳ chọn: `POST /api/edit-image` (chỉnh nhẹ) hoặc tab **Biến thể kích thước** (luôn dùng flash + layout adaptation từ banner gốc).
7. Export (Canvas API, không watermark) → `track('export_banner', …)`.

Chi tiết từng bước, component, và endpoint: xem [Frontend](./frontend.md), [Backend](./backend.md), [API Reference](./api.md).

## Auth & Analytics (tóm tắt)

- **Clerk** quản lý session; role (`admin`/`mod`/`editor`) + `blocked` lưu trong Clerk metadata; hỗ trợ đa phiên/đa thiết bị, user tự quản lý tại `/account/sessions`, admin quản lý qua dashboard. Chi tiết RBAC: [Backend § RBAC](./backend.md#rbac-libauthzts-librequire-userts).
- **Analytics**: mọi event chuẩn hoá tên trong `lib/analytics-events.ts`, ghi qua `POST /api/track` xuống Postgres; dashboard (`/dashboard`) tổng hợp theo khoảng thời gian. Chi tiết: [Backend § Analytics & Dashboard DB](./backend.md#analytics--dashboard-db-postgresql).

## Tài liệu liên quan

- [Frontend](./frontend.md) — cấu trúc UI, state, luồng tương tác.
- [Backend](./backend.md) — Route Handlers, RBAC, Gemini, bảo mật.
- [API Reference](./api.md) — contract từng endpoint.
- [Deploy](./deploy.md) — Vercel, Clerk, domain, Postgres production.
- [Workflow](./workflow.md) — setup local, env, checklist thử nghiệm.
