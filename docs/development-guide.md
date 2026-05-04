# Hướng dẫn phát triển

Tài liệu tập trung vào **cấu hình FE/BE**, **luồng làm việc** và **API** (tóm tắt). Chi tiết từng endpoint xem [API Reference](./api.md); sơ đồ module xem [Architecture](./architecture.md); **triển khai production (Vercel, Clerk, domain, DB)** xem [Deploy](./deploy.md).

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

Cùng một repo Next.js, nhưng **biến môi trường và ranh giới thực thi** khác nhau.

### Frontend (trình duyệt)

- Chạy trong browser: React components, Zustand, `fetch` tới `/api/*`.
- Chỉ đọc được biến có tiền tố `**NEXT_PUBLIC_*`** (embed vào bundle).
- **Clerk**: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — dùng cho SDK phía client (nút đăng nhập, session).
- **Gọi API**: không gắn `GEMINI_API_KEY` trên client; mọi gọi Gemini đi qua Route Handlers.
- **Font / UI**: Inter qua `next/font` trong `app/layout.tsx`; Tailwind + component trong `components/`.

### Backend (server — Route Handlers & middleware)

- File trong `app/api/**/route.ts` và middleware `proxy.ts` chạy trên Node.
- `**GEMINI_API_KEY`**: chỉ server; dùng cho `@google/generative-ai` (generate, enhance, edit-image).
- `**CLERK_SECRET_KEY`**: chỉ server; xác thực session / gọi Clerk Backend API (ví dụ enrich user trên dashboard).
- `**DATABASE_URL`**: chỉ server; `pg` pool cho analytics.
- `**proxy.ts`**: export `clerkMiddleware()` — bảo vệ / đồng bộ auth theo khuyến nghị Clerk cho App Router.

## Cấu hình file `.env.local`

Tạo file `**.env.local`** ở thư mục gốc project. **Không** commit (đã có trong `.gitignore`).

### Biến bắt buộc (tạo ảnh / cải thiện prompt / chỉnh sửa ảnh)


| Biến             | Mô tả                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY` | Key server cho `@google/generative-ai` — dùng cho `POST /api/generate`, `POST /api/enhance-prompt`, `POST /api/edit-image`. |


### Biến Clerk (đăng nhập)


| Biến                                | Phạm vi        | Mô tả            |
| ----------------------------------- | -------------- | ---------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Client + build | Publishable key. |
| `CLERK_SECRET_KEY`                  | Server only    | Secret key.      |


Lấy key tại [Clerk Dashboard](https://dashboard.clerk.com/) → **API Keys**.  
Production: tạo **Production instance**, copy key production vào biến môi trường trên host (Vercel). Development keys có giới hạn — không dùng cho site public.

### Biến PostgreSQL (analytics)


| Biến           | Mô tả                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------ |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL, ví dụ `postgresql://user:pass@host:5432/dbname?sslmode=require`. |


- Lấy từ nhà cung cấp: [Neon](https://neon.tech/), [Supabase](https://supabase.com/), RDS, v.v.
- Nếu mật khẩu hoặc URL có ký tự đặc biệt (`&`, `#`, `@`, …), hãy **URL-encode** hoặc bọc toàn bộ giá trị trong **dấu nháy đơn** trong `.env.local`, ví dụ: `DATABASE_URL='postgresql://...'`.

### Ví dụ `.env.local` đầy đủ

```bash
GEMINI_API_KEY=your_gemini_key

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

DATABASE_URL='postgresql://user:pass@host:5432/dbname?sslmode=require'
```

## Migration analytics (PostgreSQL)

Sau khi có `DATABASE_URL` hợp lệ:

```bash
set -a && source .env.local && set +a
psql "$DATABASE_URL" -f db/banner_events.sql
```

Nếu bảng/index đã tồn tại, Postgres có thể báo `already exists, skipping` — vẫn coi là thành công.

Kiểm tra nhanh:

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM banner_events;"
```

## Luồng làm việc (workflow) — từ góc nhìn sản phẩm

1. **Đăng nhập** (Clerk) — các thao tác tạo banner chính yêu cầu user đã sign in.
2. **Chọn canvas** — preset (ví dụ Zalo OA Img, MP3 Home) hoặc custom; state trong Zustand.
3. **Upload asset** — ảnh sản phẩm / logo / ảnh tham chiếu style; chuẩn bị data URL gửi kèm generate.
4. **Nhập nội dung** — prompt chính, headline, sub, CTA; tùy chọn “Giữ nguyên chủ thể upload” (strict preserve).
5. **(Tùy chọn) Cải thiện prompt** — `POST /api/enhance-prompt` cập nhật text prompt.
6. **Tạo banner** — `POST /api/generate`; hiển thị tiến trình / lỗi có mã; lưu ảnh + stats (model, thời gian, token, cost).
7. **Preview** — hiển thị ảnh trong canvas; có thể ghi nhận analytics preview theo `banner_id`.
8. **(Tùy chọn) Chỉnh sửa ảnh đã tạo** — `POST /api/edit-image` với `imageDataUrl` + `editPrompt` (điều chỉnh nhẹ, không tạo mới hoàn toàn).
9. **Xuất file** — export PNG/JPG qua Canvas API; có thể dùng `GET /api/proxy-image` nếu cần tải ảnh remote.
10. **Analytics** — `track(...)` gửi sự kiện tới `POST /api/track` (generate, preview, export, …).

## Dashboard analytics

- URL local: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- Dữ liệu: `GET /api/dashboard` và `GET /api/dashboard/users` với query `range` (`today`, `7d`, `30d`) và `page` (users).
- Trang client **poll** định kỳ (mặc định khoảng 10 phút trong code hiện tại); cần có event thật trong app thì số liệu mới tăng.

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

- Model tạo ảnh khóa ở `gemini-3.1-flash-image-preview` trừ khi có quyết định kiến trúc mới.
- Ưu tiên **giữ trung thực asset** user upload khi generate.
- Khi generate thất bại có placeholder: phản hồi phải gồm `failedStep` + `placeholderError` (hoặc tương đương) để UI báo rõ bước lỗi.
- Export: không chèn thêm watermark logo (logo đã có trong thiết kế thì do user/model).

## Checklist thử nghiệm thủ công

1. Upload asset, bật/tắt “Giữ nguyên chủ thể upload”.
2. Tạo ảnh và kiểm tra preview + hộp stats (model, thời gian, token).
3. Thử lỗi (timeout / quota) và xác nhận thông báo có mã lỗi ngắn.
4. Chỉnh sửa ảnh đã tạo qua `edit-image`.
5. Export PNG/JPG; xác nhận không bị chèn watermark thêm.

## Xử lý sự cố (troubleshooting)

- **Hydration / `bis_skin_checked`**: thường do extension trình duyệt (ví dụ Bitwarden). Tắt extension trên `localhost` hoặc dùng profile sạch.
- **Chỉ thấy placeholder khi generate**: đọc thông báo lỗi trên UI; kiểm tra `GEMINI_API_KEY`, quota, và log server.
- `**source .env.local` lỗi `parse error near '&'`**: bọc `DATABASE_URL` trong `'...'`.
- `**psql: command not found`**: cài client PostgreSQL (ví dụ `brew install libpq`) hoặc dùng SQL editor trên dashboard DB.
- **Socket Postgres local failed**: `DATABASE_URL` đang trỏ localhost nhưng server không chạy — dùng URL remote đầy đủ.
- **Dashboard trả 500 / không có dữ liệu**: kiểm tra `DATABASE_URL` trên Vercel và đã chạy migration.

## Tài liệu liên quan

- [Architecture](./architecture.md)
- [API Reference](./api.md)
- [Deploy](./deploy.md)
- [README](../README.md)

