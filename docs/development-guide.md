# Development Guide

## Yeu cau moi truong

- Node.js >= `20.9.0`
- NPM (hoac package manager tuong duong)
- API key cho Gemini

## Cai dat

```bash
npm install
```

## Cau hinh env

Tao file `.env.local`:

```bash
GEMINI_API_KEY=your_api_key_here
```

Khong commit secrets.

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

## Tai lieu lien quan

- `docs/architecture.md`
- `docs/api.md`
- `README.md`

