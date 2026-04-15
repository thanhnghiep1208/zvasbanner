# AI Banner Generator - Project Overview

## 1) Tong quan du an

AI Banner Generator la ung dung web tao banner marketing bang AI tu prompt + assets nguoi dung upload. Muc tieu chinh:

- Tao nhanh 1 banner chat luong cao theo kich thuoc canvas da chon.
- Giu nguyen chu the upload (san pham/logo/chu the) va sang tao them nen, anh sang, hieu ung.
- Cho phep export anh cuoi cung theo PNG/JPG va scale 1x/2x.

Hien tai he thong uu tien duy nhat model tao anh `gemini-3.1-flash-image-preview`.

---

## 2) Cong nghe su dung

### Core stack

- **Next.js 16 (App Router)** - frontend + API routes.
- **React 19 + TypeScript** - UI va typing an toan.
- **Tailwind CSS v4** - style system.
- **shadcn/ui + Base UI** - cac component co san.
- **Zustand** - global state editor.
- **Sonner** - toast feedback.

### AI + image processing

- **@google/generative-ai** - goi Gemini server-side.
- **Gemini model**: `gemini-3.1-flash-image-preview` (locked).
- **Canvas API (client-side)** - export va xu ly anh.
- **/api/proxy-image** - proxy image remote de tranh CORS khi ve canvas.

---

## 3) Kien truc tong the

- **Frontend (App Router pages + components)**:
  - Nhap prompt, style controls, upload assets, trigger generate.
  - Hien thi preview banner.
  - Export output.
- **Backend (Next.js route handlers)**:
  - `/api/enhance-prompt`: cai thien prompt bang Gemini text flow.
  - `/api/generate`: tao 1 banner image, tra ve image + metadata + loi chi tiet neu fallback placeholder.
  - `/api/proxy-image`: fetch image qua proxy an toan.
- **State layer**:
  - `store/editor.ts` quan ly canvas config, assets, style, progress, generatedImage, generation stats.

---

## 4) Functional specs chinh

### 4.1 Prompt va generation

- Input chinh: `userPrompt`, `headline`, `subheadline`, `cta`.
- Prompt final duoc compose client-side (`lib/client-generation.ts`).
- Generate 1 ket qua duy nhat (khong con 3 variants).

### 4.2 Asset preserve mode

- Toggle: **"Giu nguyen chu the upload"** (UI trong `PromptInput`).
- Khi bat:
  - Prompt ep model khong thay the/redraw chu the upload.
  - Chi cho phep blend nhe (tone/shadow/edge cleanup).

### 4.3 Fallback va error reporting

- Neu model fail hoac timeout:
  - Tra placeholder image.
  - Tra kem metadata loi ro rang:
    - `failedStep`
    - `placeholderError`
- Client hien toast + generationError de user biet fail o buoc nao.

### 4.4 Generation status box

Sau moi lan generate, UI hien box status nho gom:

- Model da dung.
- Thoi gian tao (giay).
- Token usage (total/prompt/output) neu model tra ve.

### 4.5 Export

- Export PNG/JPG, quality (JPG), scale 1x/2x.
- **Khong chen them logo/watermark** khi export (giu nguyen banner da tao).

---

## 5) Flow nghiep vu (end-to-end)

1. User chon canvas preset + upload assets.
2. User nhap prompt/noi dung + style options.
3. User bam **Tao banner**.
4. Client goi `POST /api/generate`.
5. Server:
  - validate request,
  - assemble prompt,
  - goi `gemini-3.1-flash-image-preview`,
  - tra `{ image, source, meta }`,
  - neu fail tra placeholder + error detail.
6. Client cap nhat `generatedImage`, progress, status box.
7. User export output.

---

## 6) Frontend structure (tom tat)

- `components/prompt/PromptInput.tsx`
  - Prompt input + action buttons.
  - Toggle preserve mode.
  - Hien status box model/time/token.
- `components/prompt/StyleControls.tsx`
  - Style/mood/font/background options.
- `components/canvas/CanvasArea.tsx`
  - Preview duy nhat cho ket qua banner.
- `components/layout/ExportPopover.tsx`
  - Cau hinh va trigger export.
- `components/layout/EditorWorkspace.tsx`
  - Layout 3 cot editor.
- `store/editor.ts`
  - Zustand state cho toan bo editor.

---

## 7) Backend structure (tom tat)

- `app/api/generate/route.ts`
  - Main generation endpoint.
  - Timeout wrapper.
  - Placeholder fallback + detailed failure info.
- `lib/gemini-server.ts`
  - Gemini helpers (enhance + image).
  - Build inline multimodal parts tu assets.
  - Trich xuat usage metadata.
- `lib/prompt-builder.ts`
  - Build system/context/creative/output instructions.
- `lib/validate-generation.ts`
  - Runtime validation cho API payload.
- `app/api/proxy-image/route.ts`
  - Proxy image cho canvas export flow.

---

## 8) Data contracts chinh

### Generate request (rut gon)

- `canvasConfig`
- `assets[]` (co the co `dataUrl` de multimodal)
- `brandKit`
- `userPrompt`
- `styleControls` (bao gom `strictPreserveMode`)

### Generate response (rut gon)

- `image: string` (data URL)
- `source: "gemini" | "placeholder"`
- `meta?: { model, elapsedMs, promptTokens?, outputTokens?, totalTokens? }`
- `failedStep?: string`
- `placeholderError?: string`

---

## 9) Huong dan build/run

## Yeu cau

- Node.js >= `20.9.0`
- NPM (hoac package manager tuong duong)
- `GEMINI_API_KEY` hop le

## Cai dat

```bash
npm install
```

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

## Lint

```bash
npm run lint
```

---

## 10) ENV can thiet

Tao file `.env.local`:

```bash
GEMINI_API_KEY=your_api_key_here
```

Khong commit file chua secret.

---

## 11) Ghi chu van hanh

- Neu gap hydration warning `bis_skin_checked`, thu tat extension browser (vd. Bitwarden) tren localhost.
- Neu output la placeholder, xem toast/error detail de biet fail o buoc nao.
- Token usage tuy model/response co the tra ve hoac khong.

