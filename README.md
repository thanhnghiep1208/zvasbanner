This is a [Next.js](https://nextjs.org) project bootstrapped with [create-next-app](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Documentation

- [Architecture](docs/architecture.md) — tổng quan hệ thống, tech stack, luồng tạo ảnh
- [Frontend](docs/frontend.md) — cấu trúc UI, state (Zustand), luồng tương tác
- [Backend](docs/backend.md) — Route Handlers, RBAC, tích hợp Gemini, **bảo mật** (CSP, rate limit, SSRF, …)
- [API Reference](docs/api.md) — contract từng endpoint (`/api/generate`, `/api/sessions`, dashboard, …)
- [Workflow](docs/workflow.md) — cài đặt `.env.local`, RBAC, checklist thử nghiệm
- [Deploy](docs/deploy.md) — Vercel + Clerk + domain + Postgres
- [Roadmap](docs/roadmap/) — đề xuất tính năng chưa triển khai (ví dụ Canva Connect)

Tính năng chính: tạo banner AI (Gemini, cohesion prompt + harmony pass ngầm), chỉnh sửa ảnh, **biến thể kích thước** (preset có icon tỉ lệ), export, analytics Postgres, dashboard admin, **quản lý phiên đăng nhập** tại `/account/sessions`.

## Troubleshooting (Local Dev)

- If you see React hydration mismatch warnings with `bis_skin_checked`, this is usually caused by browser extensions (commonly Bitwarden) injecting attributes into the DOM before hydration.
- Fix: disable the extension/autofill for `localhost:3000` (or open in an extension-free profile) and hard refresh.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [next/font](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to load [Inter](https://fonts.google.com/specimen/Inter) (subset Latin + Vietnamese) via `app/layout.tsx`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.