# Triển khai production (Vercel + Clerk + domain)

Checklist để đưa **AI Banner Generator** lên môi trường thật: Vercel làm host Next.js, Clerk làm auth, PostgreSQL cho analytics. Làm theo thứ tự giúp tránh lỗi “deploy xong nhưng không đăng nhập / không gọi được API”.

## 0. Chuẩn bị

- Repo đã push lên GitHub/GitLab/Bitbucket (Vercel import trực tiếp).
- Tài khoản [Vercel](https://vercel.com/), [Clerk](https://clerk.com/), nhà cung cấp Postgres (ví dụ [Neon](https://neon.tech/), [Supabase](https://supabase.com/)).
- API key [Google AI Studio](https://aistudio.google.com/) cho Gemini (server).

---

## 1. Clerk — tạo Production application

1. Vào [Clerk Dashboard](https://dashboard.clerk.com/) → chọn **Production** (hoặc **Create production instance** — thường clone từ Development để giữ cấu hình đăng nhập).
2. Vào **API Keys** → copy:
  - **Publishable key** (`pk_live_...`) → map vào `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` trên Vercel.
  - **Secret key** (`sk_live_...`) → `CLERK_SECRET_KEY` (chỉ server, không lộ ra client).
3. **Không** dùng key `pk_test_` / `sk_test_` trên site public: trình duyệt sẽ cảnh báo và có giới hạn.

### 1.1 Domain & URL trong Clerk (bước quan trọng)

Sau khi có URL production (Vercel hoặc domain riêng), cấu hình trong Clerk:


| Mục trong Clerk (tên có thể hơi khác theo UI)  | Giá trị gợi ý                                                                                                                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend API** / **Primary application URL** | `https://app.yourdomain.com` hoặc `https://your-project.vercel.app`                                                                                                         |
| **Allowed origins**                            | Cùng các origin trên (thêm cả biến thể `www` nếu dùng).                                                                                                                     |
| **Redirect / callback URLs**                   | Base URL production và các path callback mà Clerk yêu cầu (ví dụ sign-in, sign-up). Thêm luôn URL deploy Vercel (`*.vercel.app`) nếu người dùng vẫn truy cập qua domain đó. |


**Lưu ý domain Vercel (`*.vercel.app`):** Một số tính năng Clerk/domain có thể hạn chế với subdomain do nền tảng cấp (provider domain). Khi cần đầy đủ tính năng và kiểm soát DNS, **dùng domain riêng** (mục 3) là lựa chọn ổn định hơn.

### 1.2 Sau khi đổi domain

- Cập nhật lại toàn bộ URL trong Clerk (origins + redirects) khớp **chính xác** scheme `https` và host (không thừa slash, đúng www/non-www).
- Redeploy Vercel sau khi sửa biến môi trường (hoặc đợi build mới) để client nhận đúng publishable key / domain.

---

## 2. PostgreSQL production

1. Tạo database (region gần user hoặc gần Vercel nếu có tùy chọn).
2. Lấy **connection string** dạng `postgresql://user:pass@host:5432/db?sslmode=require`.
3. Chạy migration **một lần** trên DB production:
  ```bash
   psql "$DATABASE_URL" -f db/banner_events.sql
  ```
   Hoặc dán nội dung `db/banner_events.sql` vào SQL editor của nhà cung cấp.
4. Kiểm tra: `SELECT COUNT(*) FROM banner_events;` (có thể là `0` — chỉ cần bảng tồn tại).

---

## 3. Domain riêng trỏ về Vercel (tùy chọn nhưng khuyến nghị)

### 3.1 Thêm domain trong Vercel

1. Project → **Settings** → **Domains** → Add `app.yourdomain.com` (hoặc `yourdomain.com`).
2. Vercel hiển thị bản ghi DNS cần tạo (thường **CNAME** tới `cname.vercel-dns.com` hoặc **A** record theo hướng dẫn).

### 3.2 Cấu hình DNS tại registrar

- **CNAME**: `app` → target Vercel cung cấp (hoặc ALIAS/ANAME nếu root domain).
- Chờ propagate (vài phút đến vài giờ).

### 3.3 Đồng bộ lại Clerk

- Primary URL + allowed origins + redirect URLs dùng **đúng** `https://app.yourdomain.com` (và biến thể www nếu có).

---

## 4. Vercel — tạo project & deploy

1. **New Project** → Import Git repo.
2. **Framework Preset**: Next.js (auto).
3. **Node.js**: chọn **20.x** (khớp `engines` trong `package.json`).
4. **Root directory**: để mặc định nếu app ở root repo.
5. **Build & Output**: mặc định `next build` (không cần chỉnh trừ khi monorepo).

### 4.1 Environment Variables (Production)

Thêm trong **Settings → Environment Variables** (scope **Production**; có thể thêm **Preview** nếu team cần test PR):


| Biến                                | Môi trường | Ghi chú                                                      |
| ----------------------------------- | ---------- | ------------------------------------------------------------ |
| `GEMINI_API_KEY`                    | Production | Key Gemini, chỉ server.                                      |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Production | `pk_live_...`                                                |
| `CLERK_SECRET_KEY`                  | Production | `sk_live_...`                                                |
| `DATABASE_URL`                      | Production | Postgres production; nhớ `sslmode=require` nếu host yêu cầu. |


- Không commit các giá trị này vào git.
- Sau khi thêm/sửa biến: **Redeploy** deployment mới nhất để build nhúng đúng các biến tiền tố `NEXT_PUBLIC_` (ví dụ publishable key Clerk).

### 4.2 Deploy & xem log

1. **Deploy**; chờ build xanh.
2. Nếu build lỗi: xem tab **Build Logs** (thiếu env, lỗi TypeScript, v.v.).
3. Runtime lỗi (API 500): xem **Functions** / **Logs** trên Vercel.

---

## 5. Checklist sau deploy (smoke test)

Thực hiện trên URL production (domain hoặc `*.vercel.app`):

- Mở trang chủ, không lỗi 500.
- **Sign in / Sign up** hoạt động (không loop redirect, không chặn CORS).
- Sau đăng nhập: thấy canvas / có thể **tạo banner** (gọi Gemini thành công).
- **Export** ảnh tải xuống được.
- Mở `/dashboard` (nếu không chặn): dữ liệu aggregate không 500; sau vài hành động, số liệu thay đổi (cần DB + event `track`).

---

## 6. Preview deployments (PR / branch)

- Vercel tạo URL preview cho mỗi PR; **Clerk** cần thêm các origin/redirect tương ứng `https://*-*.vercel.app` nếu muốn đăng nhập trên preview (hoặc dùng Clerk **development** keys chỉ cho preview — tách biến môi trường Preview trong Vercel).
- Tránh lẫn `DATABASE_URL` production vào Preview nếu không muốn ghi analytics thật từ nhánh dev.

---

## 7. Sự cố thường gặp


| Hiện tượng                                 | Hướng xử lý                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Clerk báo development keys trên production | Đổi sang `pk_live_` / `sk_live_` và redeploy.                                                          |
| Đăng nhập xong redirect sai / 404          | Kiểm tra **redirect URLs** và **allowed origins** trong Clerk khớp URL thật (`https`, đúng subdomain). |
| `DATABASE_URL` lỗi SSL                     | Thêm `?sslmode=require` (hoặc theo doc nhà cung cấp).                                                  |
| Dashboard 500, track lỗi                   | Chạy migration `banner_events.sql`; kiểm tra `DATABASE_URL` trên Vercel.                               |
| Generate ảnh 500 / placeholder             | Kiểm tra `GEMINI_API_KEY`, quota API, log function Vercel.                                             |


---

## Tài liệu liên quan

- [Development Guide](./development-guide.md) — cài đặt local, env, workflow dev.
- [Architecture](./architecture.md) — luồng hệ thống.
- [API Reference](./api.md) — contract endpoint.

