# Development Guide

## Yeu cau moi truong

- Node.js >= `20.9.0`
- NPM (hoac package manager tuong duong)
- Tai khoan [Google AI Studio](https://aistudio.google.com/) hoac key Gemini hop le
- (Tuy chon nhung khuyen nghi production) [Clerk](https://clerk.com/) cho dang nhap
- (Tuy chon) PostgreSQL de luu analytics; khong co `DATABASE_URL` thi `/api/track` va `/api/dashboard` se loi khi goi

## Cai dat

```bash
npm install
```

## Cau hinh env

Tao file `.env.local` o root project. **Khong** commit file nay (da co trong `.gitignore`).

### Bien bat buoc (tao anh / enhance)


| Bien             | Mo ta                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| `GEMINI_API_KEY` | Key server-side cho `@google/generative-ai` (generate + enhance prompt). |


### Bien Clerk (dang nhap UI + middleware)


| Bien                                | Mo ta                     |
| ----------------------------------- | ------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Publishable key (client). |
| `CLERK_SECRET_KEY`                  | Secret key (server).      |


Lay key trong [Clerk Dashboard](https://dashboard.clerk.com/) → API Keys. Khi dev, ban cung co the dung **Keyless** (bo qua env neu tool tu inject); production **bat buoc** set day du 2 bien.

File `proxy.ts` o root chay `clerkMiddleware()` cho App Router (khong dung `middleware.ts` ten cu).

### Bien PostgreSQL (analytics)


| Bien           | Mo ta                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | Connection string PostgreSQL, dang `postgresql://user:pass@host:5432/dbname?sslmode=require`. |


- Lay tu nha cung cap DB: [Neon](https://neon.tech/), [Supabase](https://supabase.com/), RDS, v.v.
- Neu mat khau URL co ky tu dac biet (`&`, `#`, `@`...), **URL-encode** hoac dat ca gia tri trong **ngoac don** trong `.env.local` de shell khong parse sai, vi du:
  - `DATABASE_URL='postgresql://...'`
- Schema bang: chay file `db/banner_events.sql` mot lan (xem muc duoi).

### Vi du `.env.local` day du

```bash
GEMINI_API_KEY=your_gemini_key

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

DATABASE_URL='postgresql://user:pass@host:5432/dbname?sslmode=require'
```

## Migration analytics (PostgreSQL)

Sau khi co `DATABASE_URL` hop le:

```bash
# Vi du: load env roi chay psql (can cai psql client)
set -a && source .env.local && set +a
psql "$DATABASE_URL" -f db/banner_events.sql
```

Neu bang/index da ton tai, Postgres se bao `already exists, skipping` — van coi la thanh cong.

Kiem tra nhanh:

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM banner_events;"
```

## Dashboard analytics

- URL local: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- Du lieu lay tu `GET /api/dashboard` (aggregate bang `banner_events`).
- Trang client poll moi **10 phut**; can co event thuc te trong app (generate, export, ...) de so lieu tang.

## Chay local

```bash
npm run dev
```

Mo `http://localhost:3000`.

## Build production

```bash
npm run build
npm run start
```

## Lint / type-check

```bash
npm run lint
npx tsc --noEmit
```

## Quy uoc phat trien

- Keep model image generation locked o `gemini-3.1-flash-image-preview` neu chua co quyet dinh kien truc moi.
- Khong lam mat asset fidelity: uu tien preserve chu the upload.
- Placeholder fallback phai co `failedStep` + `placeholderError`.
- Export giu nguyen banner output, khong chen them watermark/logo.

## Test checklist thu cong

1. Upload assets + bat/tat "Giu nguyen chu the upload".
2. Generate image va verify preview.
3. Kiem tra status box:
  - Model
  - Thoi gian tao
  - Token usage
4. Thu truong hop loi (mock timeout) va verify:
  - Placeholder duoc hien
  - Error thong bao ro buoc loi
5. Export PNG/JPG va verify output khong bi chen logo watermark.

## Troubleshooting

- Hydration warning `bis_skin_checked`:
  - Thu tat extension autofill (vi du Bitwarden) tren localhost.
- Chi ra placeholder:
  - Xem thong bao loi tren UI (`failedStep`, `placeholderError`).
  - Check `GEMINI_API_KEY`.
  - Check network/API quota.
- `source .env.local` loi `parse error near '&'`:
  - Bao toan gia tri `DATABASE_URL` bang dau ngoac don `'` hoac `"`.
- `psql: command not found`:
  - Cai PostgreSQL client (vi du `brew install libpq` tren macOS) hoac dung SQL editor tren dashboard nha cung cap DB.
- `connection to server on socket ... failed`:
  - `DATABASE_URL` dang tro localhost nhung Postgres chua chay, hoac sai host — dung URL remote day du.
- Dashboard toan `0` / `500` tu `/api/dashboard`:
  - Chay migration `db/banner_events.sql`, verify `DATABASE_URL` tren server (Vercel → Environment Variables).

## Tai lieu lien quan

- `docs/architecture.md`
- `docs/api.md`
- `README.md`

