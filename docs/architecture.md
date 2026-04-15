# Architecture Overview

## Tong quan

AI Banner Generator la ung dung web tao 1 banner marketing bang AI tu prompt va assets nguoi dung upload.

Muc tieu chinh:

- Tao nhanh 1 banner chat luong cao theo canvas preset.
- Giu nguyen chu the upload (san pham/logo/chu the), chi sang tao them o nen va hieu ung.
- Export ket qua cuoi cung theo PNG/JPG.

Model tao anh duoc lock: `gemini-3.1-flash-image-preview`.

## Kien truc he thong

He thong gom 3 lop chinh:

- **Frontend (Next.js App Router + React):**
  - Nhap prompt, style controls, upload assets.
  - Trigger generate va hien thi preview.
  - Export output.
- **Backend (Next.js API Routes):**
  - `/api/enhance-prompt`
  - `/api/generate`
  - `/api/proxy-image`
- **State management (Zustand):**
  - Quan ly canvas, assets, style, generated image, progress, generation stats.

## Tech stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS v4
- shadcn/ui + Base UI
- Zustand
- Sonner
- @google/generative-ai

## Luong nghiep vu end-to-end

1. User chon canvas + upload assets.
2. User nhap noi dung prompt va style.
3. Client goi `POST /api/generate`.
4. Server validate payload, build full prompt, goi Gemini image model.
5. Server tra ve:
  - Thanh cong: `{ image, source: "gemini", meta }`
  - Loi: placeholder + `failedStep` + `placeholderError` + `meta`
6. Client cap nhat `generatedImage`, progress, error state, status box.
7. User export anh.

## Frontend module map

- `components/prompt/PromptInput.tsx`
  - Prompt input, action buttons.
  - Toggle "Giu nguyen chu the upload".
  - Status box model/time/token.
- `components/prompt/StyleControls.tsx`
  - Style, mood, font, background checklist.
- `components/canvas/CanvasArea.tsx`
  - Preview duy nhat cho ket qua banner.
- `components/layout/ExportPopover.tsx`
  - Export format/quality/scale.
- `components/layout/EditorWorkspace.tsx`
  - Layout 3 cot.
- `store/editor.ts`
  - Global editor state.

## Backend module map

- `app/api/generate/route.ts`
  - Endpoint tao anh chinh.
  - Timeout wrapper, fallback placeholder, error detail.
- `lib/gemini-server.ts`
  - Gemini helper cho enhance va image generation.
  - Build inline multimodal parts tu assets.
  - Trich usage metadata (token/time/model).
- `lib/prompt-builder.ts`
  - Assemble prompt theo sections (system/context/creative/user/output).
- `lib/validate-generation.ts`
  - Runtime validation cho API payload.
- `app/api/proxy-image/route.ts`
  - Proxy image remote de tranh CORS canvas taint.