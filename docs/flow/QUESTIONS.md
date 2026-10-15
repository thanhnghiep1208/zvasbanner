# Flow Canvas – Câu hỏi chờ quyết định

> Theo mục 9 của `SPEC.md`. Mỗi câu hỏi: bối cảnh, lựa chọn, đề xuất, trạng thái.
> Khi Nghiệp trả lời: ghi quyết định vào dòng "Trạng thái", rồi cập nhật SPEC nếu cần.

## Q1 – Không có config thật trong Postgres để làm fixture (task T1.4)
Bối cảnh: DB chỉ có bảng analytics `banner_events` (`db/banner_events.sql`). App không lưu project hay `GenerationRequest`; form giữ state trong `store/editor.ts` (Zustand, không persist) và gửi thẳng lên `/api/generate`. Vì vậy không có "config thật từ Postgres".
Lựa chọn:
- A. Lấy 3–5 payload `GenerationRequest` thật bằng cách log body ở client (`lib/client-generation.ts`) khi dùng form local, ẩn `dataUrl`/ảnh, lưu thành fixture JSON.
- B. Tự dựng 3–5 `GenerationRequest` theo các trường hợp thường gặp (1 sản phẩm, có logo + style-reference, có headline/subheadline/CTA, bật/tắt `strictPreserveMode`).
- C. Thêm log payload phía server vào `/api/generate` (đụng nguyên tắc 2.2).
Đề xuất: A, bổ sung bằng B cho các trường hợp hiếm. Sửa câu chữ T1.4 thành "≥3 payload GenerationRequest thật".
Trạng thái: **đã chốt A** (2026-10-12)

## Q2 – Không có model `TextLayer` / `lib/text-layer-render.ts` (task T1.5, T4.4, mục 2.6, 5.2)
Bối cảnh: Repo không có `TextLayer` cũng không có `lib/text-layer-render.ts` (đã grep toàn bộ code và lịch sử git). Text hiện chỉ là các string `headline`, `subheadline` (và CTA) trong `store/editor.ts`, được đưa vào prompt để Gemini vẽ chữ luôn vào ảnh. Mục 5.2 yêu cầu đo text "bằng cùng logic font metrics của `lib/text-layer-render.ts`", điều này không làm được.
Lựa chọn:
- A. Thiết kế mới model text layer trong `lib/flow/schema.ts` (font family, weight, size, line-height, color, align, max lines…) và viết text renderer mới (Canvas 2D, dùng chung cho preview và export).
- B. P1 giữ text do AI vẽ như form hiện tại (`renderSource: 'ai'` cho mọi role), hoãn text layer thật sang sau P1.
Đề xuất: A, vì composed mode cần chữ là layer riêng để không bị Gemini viết sai chính tả. Nhưng đây là việc lớn, cần ghi rõ trong SPEC là phải xây mới, đồng thời sửa danh sách type ở mục 2.6.
Trạng thái: **đã chốt A** (2026-10-12)

## Q3 – Không có composed mode / `ComposedDoc` / `ProductLayer` để tái sử dụng (task T4.3, mục 5.4)
Bối cảnh: Mục 5.4 viết "Compose client-side theo hệ thống composed mode hiện có (tìm ComposedDoc/ProductLayer trong repo, tái sử dụng)". Repo không có các type này, và cũng không có `ShadowConfig`, `LightingProfile` (ngoài bản mới trong `lib/flow/schema.ts`). Pipeline hiện tại chỉ có flat: Gemini sinh một ảnh hoàn chỉnh. `lib/export.ts` export ảnh đã có, không compose layer.
Lựa chọn:
- A. Viết mới Compose (Canvas 2D: nền + product có alpha + contact shadow + text layer) trong `lib/flow/compose/` hoặc `lib/compose/`; export từ canvas đó.
- B. Dùng thư viện canvas (Konva/Fabric) cho Compose và editor layer.
Đề xuất: A cho P1 (không thêm dependency lớn, theo mục 6.5). Sửa mục 5.4 thành "viết mới".
Trạng thái: **đã chốt A** (2026-10-12)

## Q4 – Không tắt được harmony pass cho flat (task T4.5)
Bối cảnh: `app/api/generate/route.ts` luôn chạy `runHarmonyPass` ngay sau mỗi lần generate Gemini thành công (best-effort, timeout ~30s). Không có tham số nào để tắt. Graph có node `harmony-pass` tuỳ chọn và `flat.harmonyPass: boolean`, nên `harmonyPass = false` không thực hiện được nếu không sửa route (nguyên tắc 2.2). Ngoài ra `estimateAiCalls` đang tính flat không harmony là 1 call/ratio, trong khi thực tế luôn là 2.
Lựa chọn:
- A. Thêm field tuỳ chọn `skipHarmony` vào request `/api/generate` (mặc định `false`, form cũ không đổi hành vi).
- B. Bỏ node `harmony-pass`; coi harmony là một phần cố định của `generate-flat` (luôn 2 call/ratio).
Đề xuất: B cho P1 (không đụng pipeline cũ, và estimate đúng thực tế). Nếu sau này cần bật/tắt thì làm A.
Trạng thái: **đã chốt B** (2026-10-12)

## Q5 – Không có project cũ để migrate (task T6.2, mục 5.8)
Bối cảnh: Vì app không lưu project (xem Q1), script "migrate project cũ: config cũ → fromLegacyConfig → decompileJob → lưu" không có dữ liệu đầu vào. `fromLegacyConfig` vẫn hữu ích để chuyển state form đang mở thành graph, và để so sánh parity ở T2.7.
Lựa chọn:
- A. Bỏ T6.2. Thay bằng "nút Mở trong canvas trên form cũ: state editor → GenerationRequest → fromLegacyConfig → decompileJob".
- B. Giữ T6.2 để phòng khi bước 6 có lưu project trước khi gỡ form.
Đề xuất: A.
Trạng thái: **đã chốt A** (2026-10-12)

## Q6 – Schema lệch type thật trong `lib/types.ts` (task T1.1–T1.3)
Bối cảnh: Các điểm lệch tìm được khi đối chiếu với `GenerationRequest`:
- `ModelId = 'gemini-pro' | 'gemini-flash'`, nhưng type thật là `ImageGenerationModel = 'nano-banana-pro' | 'nano-banana-2'`.
- Node `style` chỉ có `presetId`/`description`; thiếu `StyleControls` (style, mood, colorPalette, fontStyle, strictPreserveMode, backgroundConfig).
- Thiếu `marketingBrief` (campaignIntents, focalSubjects).
- Asset role thật gồm `logo | image | background | decoration | style-reference`; schema chỉ có `product-asset` và `reference-image`.
- `BrandKit` thật là `{ colors, fontPreference?, logoPosition? }` gửi inline; schema dùng `brandKitId`, mà app không có bảng brand kit.
- `CanvasConfig` thật là `{ width, height, platform, name }`, một kích thước mỗi request; `RatioSpec` thiếu `platform`/`name`. `id` nên dùng preset id trong `lib/canvas-presets.ts`.
Lựa chọn:
- A. Sửa schema ngay trong T1.1–T1.3 cho khớp type thật (schema v1 chưa lưu dữ liệu nào nên chưa cần migration).
- B. Giữ schema, xử lý lệch trong adapter.
Đề xuất: A, làm trước khi có dữ liệu lưu thật. Tái sử dụng type từ `lib/types.ts` thay vì định nghĩa lại.
Trạng thái: **đã chốt A** (2026-10-12)

## Q7 – Asset không có kho lưu bền (task T6.1, không chặn bước 1–2)
Bối cảnh: Khi upload, form tạo `url` dạng `blob:` (mất khi reload) và `dataUrl` giữ trong bộ nhớ (`components/assets/AssetUploader.tsx`, `store/editor.ts`). Repo không có kho lưu file (S3/R2/Vercel Blob). Graph lưu Postgres chỉ giữ `FlowAsset` (`assetId`, `url`…), nên mở lại project đã lưu sẽ không có ảnh.
Lựa chọn:
- A. Thêm kho lưu asset (Vercel Blob hoặc S3/R2), upload khi thêm node asset, `url` là URL bền.
- B. P1 chưa lưu graph có asset: lưu/tải graph nhưng yêu cầu upload lại ảnh khi mở.
Đề xuất: A, quyết trước T6.1 (là hạ tầng mới, cần duyệt theo mục 6.5 của SPEC).
Trạng thái: **đã chốt A** (2026-10-12). Nhà cung cấp: **Cloudflare R2, storage class Standard** (2026-10-15).

## Q8 – Composed mode cần Route Handler mới (task T4.2, mục 5.5)
Bối cảnh: `/api/generate` chỉ sinh ảnh flat hoàn chỉnh từ `GenerationRequest`. Composed cần sinh **chỉ background** từ layout guide image, cấm chữ, không gửi pixel sản phẩm. Body và prompt khác hẳn, nên `toLegacyConfig` không biểu diễn được. Mục 5.5 ghi "Executor gọi API qua Route Handler hiện có".
Lựa chọn:
- A. Thêm route mới `app/api/flow/generate-background/route.ts` (không sửa route cũ), dùng lại `createRateLimiter(20, 1h)`, `readJsonWithSizeLimit`, `requireUser`, model profile trong `lib/gemini-server.ts` (chỉ import, không sửa).
- B. Thêm nhánh `mode: 'background'` vào `/api/generate` (sửa route cũ, trái nguyên tắc 2.2).
Đề xuất: A. Cần quyết thêm: rate limit dùng chung bucket với `/api/generate` hay bucket riêng (nguyên tắc 2.7: không tạo đường vòng → nên dùng chung).
Trạng thái: **đã chốt A** (2026-10-12). Rate limit: **dùng chung** (2026-10-15) qua `lib/generation-rate-limit.ts`; `/api/generate` sửa 1 dòng import.

## Q9 – Text layer không có chỗ trong request legacy (task T1.3, T2.6)
Bối cảnh: Form cũ chỉ có 1 headline, 1 subheadline, 1 CTA, ghép vào `userPrompt` bằng `composeUserPrompt()`. Canvas cho phép role `custom` và nhiều layer cùng role. Hiện `toLegacyConfig` lấy layer đầu tiên của mỗi role, phần còn lại không gửi và trả warning `unmapped-text`.
Lựa chọn:
- A. Giữ như hiện tại: không gửi, hiện warning trên node khi chạy flat.
- B. Ghép thêm vào cuối prompt dạng `Text: …`. Gemini sẽ vẽ, nhưng format khác form nên không còn parity.
- C. Chặn Run (lỗi validate) khi graph flat có text layer không map được.
Đề xuất: A cho P1. Flat chỉ là đường legacy; graph mới mặc định composed, nơi text layer được render riêng.
Trạng thái: **đã chốt A** (2026-10-12)

## Q10 – Bộ font cho text layer (task T4.4, không chặn bước 1–2)
Bối cảnh: App chỉ tải Inter (`next/font/google`, subset latin + vietnamese, weight 400–700) trong `app/layout.tsx`. Text layer mới (`lib/flow/text/text-style.ts`) dùng `FontId` từ registry `FLOW_FONTS`, hiện chỉ có `inter`. Trong khi đó `StyleControls.fontStyle` có 5 lựa chọn (sans, serif, display, handwritten, modern) và `BrandKit.fontPreference` là chuỗi tự do. Renderer Canvas 2D cần font đã tải xong trước khi vẽ/export; CSP `font-src 'self' data:` cho phép font self-host qua `next/font`.
Lựa chọn:
- A. P1 chỉ dùng Inter cho mọi text layer.
- B. Thêm 4–5 font Google có subset tiếng Việt qua `next/font` (không thêm npm dependency), mỗi `fontStyle` một font mặc định. Ví dụ: sans → Be Vietnam Pro, serif → Noto Serif, display → Montserrat, handwritten → Dancing Script, modern → Inter.
Đề xuất: B, chốt danh sách trước T4.4. Cần kiểm tra license (OFL) và dung lượng tải.
Trạng thái: **đã chốt B** (2026-10-12). Danh sách font trong phần Lựa chọn là đề xuất; kiểm tra license OFL, subset tiếng Việt và dung lượng khi làm T4.4.

## Q11 – Bỏ ảnh layout guide, mô tả bố cục bằng lời? (task T4.2b, đổi SPEC 3 quyết định #1)
Bối cảnh: Thí nghiệm T4.2b (20 lượt Gemini, Nano Banana 2, brief nội thất, ảnh trong `docs/flow/t4.2b/`):
- A (hiện tại: ảnh guide khung gạch chéo + toạ độ % trong prompt): landscape 1/2 mẫu còn panel khớp vùng sản phẩm.
- B (không ảnh, toạ độ %): panel trắng trôi nổi, cây đặt vào vùng chữ.
- C (ảnh guide vệt mờ): **vẽ chữ vào ảnh** ("Left 12% top 38%…", lorem) 2/2 mẫu.
- D (A + câu cấm panel/cấm viết toạ độ): landscape tốt hơn A, nhưng square **vẽ "LAYOUT GUIDE", toạ độ, "Your text here" + khung** 2/2, portrait thành ảnh cắt dán 2/2.
- E (không ảnh guide, bố cục bằng lời, không con số, không từ "zone/layout/guide"): **0/6 ảnh có chữ/nhãn/khung kiểu template**; square + portrait sạch, có đế/vệt sáng đúng chỗ; landscape 1/2 mẫu đồ vật lấn vùng sản phẩm, 1/2 có hốc tường khớp vùng.
Nhận định: toạ độ % + ảnh guide đẩy model vào chế độ "mockup/template". Giới hạn: chỉ 2 mẫu/ô (SPEC ghi ≥5), thang đo "đường ranh" tự động không khớp mắt nên bỏ.
Lựa chọn:
- A. Chuyển mặc định sang 'natural' (E): sửa SPEC 3 #1 thành "Gemini biết vị trí sản phẩm qua mô tả bố cục bằng lời"; giữ 'hatched' trong code để so sánh sau.
- B. Giữ 'hatched' (đúng SPEC), chấp nhận rủi ro chữ/khung ở square/portrait.
- C. Chạy thêm ~40 lượt (5 mẫu × 4 ratio × A/E) rồi mới chốt.
Đề xuất: A. Lỗi của E (đồ vật lấn vùng sản phẩm) phần lớn bị sản phẩm thật che; lỗi của guide (chữ/nhãn trên nền) phá hỏng banner. Đổi = 1 dòng `GUIDE_STYLE` trong `components/flow/use-flow-run.ts`.
Trạng thái: **đã chốt A** (2026-10-15) – mặc định `natural`, SPEC 3 #1 đã sửa.

