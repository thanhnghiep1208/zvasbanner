# Legacy mapping: `GenerationRequest` ↔ `CompiledJob`

"Legacy" = body mà form hiện tại gửi lên `POST /api/generate`.

- Type: `GenerationRequest` trong `lib/types.ts`.
- Dựng body: `buildGeneratePayloadFromStore()` trong `lib/client-generation.ts`, lấy từ `useEditorStore` (`store/editor.ts`).
- Server parse: `lib/validate-generation.ts`. Server dùng: `lib/prompt-builder.ts`, `lib/gemini-server.ts`, `app/api/generate/route.ts`.

Mỗi request tạo **một** ảnh ở **một** kích thước, nên một `CompiledJob` có N ratio sẽ thành N request.

## Bảng mapping

| `GenerationRequest` | Nguồn trong form | `CompiledJob` / graph | Ghi chú |
|---|---|---|---|
| `canvasConfig: {width, height, platform, name}` | `state.canvasConfig` (preset hoặc custom) | `ratios[i]` (`RatioSpec = CanvasConfig + id`) → node `ratio` | `id` = `configToPresetId()` (`lib/canvas-presets.ts`); custom → `custom-<w>x<h>`. 1 request ↔ 1 ratio |
| `assets[]` role `image` / `logo` / `decoration` | `state.assets` | `products[]` → node `product-asset` (port `product`) | Asset giữ pixel. `id` → `assetId`. Composed: không gửi cho model |
| `assets[]` role `style-reference` / `background` | `state.assets` | `references[]` → node `reference-image` (port `image`) | Gửi cho model làm tham chiếu |
| `assets[].dataUrl` | đọc file lúc upload | **không lưu** | Chỉ có lúc chạy. `toLegacyConfig` cần resolver `assetId → dataUrl` (T1.3) |
| `assets[].url` | `blob:` URL | `FlowAsset.url` | `blob:` mất khi reload, xem Q7 |
| `assets[].fileName`, `hasAlpha`, `originalDims` | upload | giữ nguyên trong `FlowAsset` | `hasAlpha = false` → warning `product-no-alpha` |
| `brandKit: {colors, fontPreference?, logoPosition?}` | `state.brandKit` (mặc định `{colors: []}`) | `brandKit?` → node `brand-kit` | Form luôn gửi. `from`: bỏ node khi rỗng; `to`: thiếu node → `{colors: []}` |
| `userPrompt` | `composeUserPrompt({userPrompt, headline, subheadline, ctaText})` | `brief.prompt` + `textLayers[]` | **Lossy**, xem mục Text |
| `styleControls.{style, mood, colorPalette, fontStyle, backgroundConfig}` | `state.styleControls` | `style?` (`FlowStyle`) → node `style` | Thiếu node → `DEFAULT_STYLE` (giống `defaultStyleControls` trong store) |
| `styleControls.strictPreserveMode` | `state.styleControls` | `flat.strictPreserveMode` → param của `generate-flat` | Hành vi executor, không phải style |
| `imageModel: 'nano-banana-pro' \| 'nano-banana-2'` | `state.imageModel` | `model` (`ModelId = ImageGenerationModel`) | Server mặc định `nano-banana-pro` |
| `marketingBrief?: {campaignIntents, focalSubjects}` | `state.marketingBrief` | `brief.marketingBrief` | `from`: thiếu → mảng rỗng |
| `layoutAdaptationFromBanner?` | ảnh đã duyệt (`AdditionalCanvasSizesPanel`) | **không lưu** | Runtime của executor: ratio thứ 2 trở đi thích nghi từ ảnh ratio đầu (T4.6) |

### Text (lossy)

Form có 3 field `headline`, `subheadline`, `ctaText`, nhưng **không gửi riêng**. `composeUserPrompt()` nối chúng vào `userPrompt` thành các dòng như sau:

```
<prompt gốc>
Headline: …
Subheadline: …
CTA: …
```

Đề xuất xử lý cho T1.2 và T1.3:
- `fromLegacyConfig` nhận thêm tuỳ chọn `{ headline, subheadline, ctaText }` khi gọi từ state editor (lossless). Khi chỉ có `GenerationRequest` (log, fixture), tách các dòng `Headline:` / `Subheadline:` / `CTA:` ở cuối prompt.
- `toLegacyConfig` lấy layer đầu tiên của mỗi role `headline` / `subheadline` / `cta` rồi ghép bằng chính `composeUserPrompt()` để giữ đúng format.
- Layer role `custom`, hoặc nhiều layer cùng role: chưa có chỗ trong legacy. Sẽ liệt kê trong QUESTIONS khi làm T1.3.

## Field của `CompiledJob` không có trong legacy

Các field này chỉ dùng trong canvas, `toLegacyConfig` bỏ qua:

- `textLayers[].renderSource`, `priority`, `minFontSizePx`, `typography`, `layerId`. Legacy: Gemini luôn vẽ chữ.
- `composed.*` (`lightDirectionDeg`, `strictNoText`, `layoutOverrides`, `shadow`). Legacy chỉ có flat; composed cần route mới, xem Q8.
- `export.*` (`format`, `quality`, `scale`, `ratioIds`). Không thuộc request; tương ứng tham số `exportBanner()` trong `lib/export.ts` và `ExportPopover` (mặc định quality 90%, scale 1).

## Phạm vi của `toLegacyConfig`

Chỉ hợp lệ với `renderMode = 'flat'`. Với `composed` phải trả lỗi rõ ràng, không được âm thầm chuyển sang flat.

Harmony pass không có node riêng (Q4). Server luôn chạy `runHarmonyPass` sau mỗi lần generate Gemini thành công, nên `generate-flat` được tính `aiCallsPerRatio = 2`.

## Trạng thái

- `from-legacy-config.ts` (T1.2): `fromLegacyConfig(request, { form? }) → { job, runtime }`.
  - `runtime` giữ `dataUrls[assetId]` và `layoutAdaptationFromBanner`. Hai thứ này không vào graph, nhưng `toLegacyConfig` cần lại để dựng request.
  - Text: có `form` thì dùng thẳng 3 field (lossless); không có thì `splitComposedPrompt()` tách các dòng `Headline:` / `Subheadline:` / `CTA:` ở cuối prompt. Chỉ nhận nhãn đúng thứ tự, mỗi nhãn tối đa 1 lần.
  - Flat: `renderSource` của text layer để mặc định `'layer'` và bị bỏ qua, vì Gemini vẽ mọi chữ.
  - Request thiếu `marketingBrief` → mảng rỗng. Vì vậy request đi round-trip sẽ có thêm field này; form luôn gửi nên không ảnh hưởng.
- `to-legacy-config.ts` (T1.3): `toLegacyConfig(job, runtime) → { ok, requests: { ratioId, request }[], warnings }`.
  - Mỗi ratio cho ra 1 request. `runtime.layoutAdaptationFromBanner` gắn vào mọi request; khi chạy nhiều ratio, executor tự đặt theo từng lần gọi (T4.6).
  - `assets`: products trước rồi references. Thứ tự giữa hai nhóm khác request gốc, nhưng server tự tách theo role (`gemini-server.ts`, `prompt-builder.ts`) nên không ảnh hưởng kết quả. Test round-trip so sánh sau khi sắp xếp theo id.
  - `composed` → lỗi `composed-not-supported` (Q8).
  - Warning `missing-asset-data`: asset không có `dataUrl` thì server bỏ qua ảnh mà không báo lỗi. Executor phải chặn Run hoặc yêu cầu tải lại ảnh.
  - Warning `unmapped-text`: layer role `custom` và layer trùng role không được gửi (Q9).
  - `composeLegacyPrompt()` là bản sao format của `composeUserPrompt()`. Không import bản gốc vì file đó kéo theo Zustand store. Có test so sánh với bản gốc.
