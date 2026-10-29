# zVas Banner AI

Công cụ nội bộ tạo banner quảng cáo bằng AI (Next.js 16 + React 19, Google Gemini, Clerk, PostgreSQL). Package: `ai-banner-generator`.

Tính năng chính: tạo banner AI (Gemini Nano Banana 2.1 mặc định, cohesion prompt + harmony pass ngầm), **làm theo banner mẫu** (ảnh tham chiếu style), chỉnh sửa ảnh, **biến thể kích thước**, export PNG/JPG, analytics Postgres, dashboard admin (role, block, phiên, cài đặt liên hệ), **quản lý phiên đăng nhập** tại `/account/sessions`, **Chế độ nâng cao** — Flow canvas `/flow` (template + chế độ Đơn giản, node Tạo banner, lưu dự án, hướng dẫn `/flow/guide`, sau cờ `FLOW_CANVAS`).

## Bắt đầu nhanh

```bash
npm install
cp .env.local.example .env.local   # điền GEMINI_API_KEY, key Clerk, DATABASE_URL — xem docs/workflow.md
psql "$DATABASE_URL" -f db/banner_events.sql
npm run dev                        # http://localhost:3000
```

Kiểm tra trước khi commit:

```bash
npx vitest run
npx tsc --noEmit
npm run lint
```

Yêu cầu Node ≥ 20.9.0.

## Tài liệu

**Người mới: đọc [docs/onboarding.md](docs/onboarding.md) trước** — lộ trình đọc, bản đồ code, sơ đồ luồng chính.

- [Architecture](docs/architecture.md) — tổng quan hệ thống, tech stack, luồng tạo ảnh
- [Frontend](docs/frontend.md) — cấu trúc UI, state (Zustand), luồng tương tác
- [Backend](docs/backend.md) — Route Handlers, RBAC, tích hợp Gemini, **bảo mật** (CSP, rate limit, SSRF, …)
- [API Reference](docs/api.md) — contract từng endpoint
- [Workflow](docs/workflow.md) — cài đặt `.env.local`, Clerk, Postgres, checklist thử nghiệm
- [Deploy](docs/deploy.md) — Vercel + Clerk + domain + Postgres
- [Flow Canvas](docs/flow/SPEC.md) — spec, quyết định ([QUESTIONS](docs/flow/QUESTIONS.md)), nhật ký
- [Roadmap](docs/roadmap/) — đề xuất chưa triển khai (ví dụ Canva Connect)
- `openspec/specs/` — spec hành vi marketing brief

## Troubleshooting (local)

- Cảnh báo hydration mismatch với `bis_skin_checked`: do extension trình duyệt (thường là Bitwarden) chèn attribute. Tắt extension cho `localhost:3000` hoặc dùng profile sạch rồi hard refresh.
- Các lỗi khác (placeholder, 409 Clerk, 429, CSP): [Workflow § Xử lý sự cố](docs/workflow.md#xử-lý-sự-cố-troubleshooting).
