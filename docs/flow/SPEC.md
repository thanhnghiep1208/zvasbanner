# Flow Canvas – Spec vận hành cho Claude Code

> Đặt file này tại `docs/flow/SPEC.md`. Mỗi phiên làm việc: đọc toàn bộ file → làm task chưa xong đầu tiên trong mục 8 → cập nhật checklist → commit.

---

## 1. Mục tiêu

Thay flow form tạo banner hiện tại của zVas Banner AI bằng **node-based canvas** (tham khảo Magnific Spaces, Topview Canvas): user kéo thả node (product, brief, text, ratio, style, model…), nối chúng lại, chạy và xuất banner.

Canvas **thay thế** form. Để không mất người dùng phổ thông, cùng một graph có hai view:
- **Simple view**: form sinh tự động từ các param được đánh dấu `exposed` của template.
- **Canvas view**: toàn bộ graph để chỉnh sâu.

Graph là source of truth duy nhất.

## 2. Nguyên tắc không được vi phạm

1. **Asset fidelity**: pixel gốc của sản phẩm không bao giờ đi qua model AI (trừ executor `legacy`). Đã khoá bằng test `rules.test.ts`; không được xoá hoặc nới test này.
2. **Không viết lại pipeline cũ** trong P1. Graph biên dịch xuống `CompiledJob` → adapter → input mà pipeline hiện tại đã hiểu. Không sửa Route Handler, `lib/prompt-builder.ts`, `lib/export.ts`, `lib/gemini-server.ts`, `lib/client-generation.ts` trừ khi task ghi rõ; nếu buộc phải sửa, dừng lại và ghi câu hỏi (mục 9).
3. **`lib/flow/` là domain thuần**: không import React, React Flow, Next.js, Zustand.
4. **Feature flag**: mọi UI mới nằm sau `FLOW_CANVAS` (`lib/flags.ts`). Form cũ giữ nguyên đến bước 6.
5. **Không persist graph vào localStorage**. Lưu Postgres (JSONB) qua `StoredFlowDoc` với `schemaVersion`.
6. **Không đoán field**: trước khi dùng type có sẵn, đọc định nghĩa thật trong `lib/types.ts` (`GenerationRequest`, `CanvasConfig`, `UploadedAsset`, `AssetRole`, `BrandKit`, `StyleControls`, `ImageGenerationModel`, `MarketingBrief`) và tái sử dụng, không định nghĩa lại. Repo **không có** `TextLayer`, `ComposedDoc`, `ProductLayer`, `LightingProfile`, `lib/text-layer-render.ts`: các phần này phải xây mới (Q2, Q3).
7. Rate limit hiện có (20 request/giờ/user) và body size cap phải được tôn trọng; graph không được tạo đường vòng qua chúng.

## 3. Quyết định đã chốt (composed mode)

| # | Quyết định | Hệ quả bắt buộc |
|---|---|---|
| 1 | Gemini biết vị trí sản phẩm khi sinh background | Auto Layout chạy **trước** Generate BG. Gửi **layout guide image** (khối xám cho vùng product/text, không phải ảnh sản phẩm thật) + chỉ dẫn "giữ vùng này sạch" |
| 2 | Tự tối ưu layout theo từng ratio, không mất content | Auto Layout rule-based client-side. Transform chuẩn hoá theo từng ratio; override tay lưu riêng theo ratio. Không đủ chỗ → báo lỗi trên node, **không tự bỏ phần tử** |
| 3 | Shadow tự động mặc định, có tuỳ chỉnh | `ShadowConfig.mode = 'auto' \| 'custom' \| 'off'`, mặc định `auto`. Hướng shadow lấy từ `lightDirectionDeg` đã chỉ định trong prompt Generate BG |
| 4 | Mặc định composed | Mọi template đi qua Compose. Flat chỉ cho project migrate và path nâng cao |

## 4. Kiến trúc

```
Product Asset ─┐
Text Layers ───┼─→ Auto Layout ─→ Generate BG ─→ Compose ─→ Export
Ratio(s) ──────┤        │              ↑            ↑
Brief ─────────┼────────┼──────────────┘            │
Style/Brand/Ref┘        └──── transforms ───────────┘
```

| Lớp | Vị trí | Trạng thái |
|---|---|---|
| Domain (schema, rules, validate, compiler, decompiler, persistence) | `lib/flow/` | Có, 82 test pass |
| IR | `lib/flow/compiled-job.ts` (`CompiledJob`, `estimateAiCalls`) | Có |
| Adapter legacy | `lib/flow/legacy/to-legacy-config.ts`, `from-legacy-config.ts` (legacy = `GenerationRequest`) | Có (T1.2–T1.4) |
| Text layer + renderer | `lib/flow/text/` (model) + renderer Canvas 2D | Model có (`text-style.ts`); renderer chưa có (T4.4) |
| Compose | `lib/flow/compose/` (Canvas 2D) | **Chưa có, xây mới (Q3)** |
| Layout engine | `lib/flow/layout/` | **Chưa có** |
| Executor engine | `lib/flow/executor.ts` | **Chưa có** |
| RF adapter | `lib/flow-ui/rf-adapter.ts` (FlowNode ↔ React Flow node) | Có (T2.1) |
| Store | `store/flow-store.ts` | Giữ `FlowGraph` domain + ui riêng (T2.2) |
| UI | `components/flow/` | Layout 3 cột: Node library · Canvas (`FlowNodeCard`) · Inspector cơ bản (T2.4) |
| Route | `app/(studio)/flow/page.tsx` (hoặc `src/app/...`) | Có, sau flag |

Node registry (`lib/flow/node-definitions.ts`): product-asset, reference-image, brief, text-layer, brand-kit, ratio, style, auto-layout, generate-background, generate-flat (legacy, đã gồm harmony pass server-side: 2 AI call/ratio), compose, export. Node `harmony-pass` bị bỏ (Q4).

## 5. Spec chi tiết theo module

### 5.1 Adapter legacy
- `toLegacyConfig(job: CompiledJob)` → đúng type mà flow form đang gửi lên API.
- `fromLegacyConfig(config)` → `CompiledJob` (dùng cho migration và để so sánh parity).
- Bảng mapping field ghi vào đầu file dạng comment. Field không map được: liệt kê trong `docs/flow/QUESTIONS.md`, không bỏ im lặng.

### 5.2 Layout engine (`lib/flow/layout/`)
- Input: products (kèm kích thước + alpha bbox nếu có), textLayers (content, role, priority, minFontSizePx, typography), ratio, overrides.
- Phân loại ratio: `landscape` (>1.2), `square` (0.8–1.2), `portrait` (<0.8), `ultra-wide` (>2.5). Mỗi loại có ≥2 layout variant gồm các slot: product, headline, subline, cta, logo.
- Thuật toán khi không vừa, theo thứ tự: thu nhỏ product tới `minScale` → giảm font tới `minFontSizePx` (layer priority thấp co trước) → thử variant kế tiếp → trả `{ ok: false, reason }`.
- Đo text bằng cùng text renderer Canvas 2D mới (Q2) dùng cho preview và export để khớp WYSIWYG.
- Output `LayoutPlan`: `transforms[ratioId][elementId]`, `guide[ratioId]` (danh sách rect để vẽ layout guide image), `variantId`.
- Override tay luôn thắng; sửa content chỉ tính lại ratio chưa bị override.
- Pure function, deterministic, có unit test cho mỗi ratio class và trường hợp không vừa.

### 5.3 Generate Background
- Prompt gồm: brief + `marketingBrief`, style, brand, hướng sáng `lightDirectionDeg`, chỉ dẫn giữ sạch vùng trong guide, negative "no text" khi `strictNoText`.
- Ngoại lệ: text layer `role=headline, renderSource='ai'` → cho phép chữ **chỉ** trong slot headline, vùng khác vẫn cấm.
- Gửi guide image dưới dạng reference image; không gửi pixel sản phẩm.
- Mỗi ratio = 1 lần gọi. Hiển thị `estimateAiCalls()` trước khi Run.

### 5.4 Compose + auto shadow
- Compose client-side **viết mới** bằng Canvas 2D (repo chưa có composed mode, Q3): nền + product alpha + contact shadow + text layer. Không thêm thư viện canvas (Konva/Fabric).
- Auto shadow P1: contact shadow mềm dưới đáy alpha bbox, lệch theo `lightDirectionDeg`. Product không alpha → shadow tắt + warning `product-no-alpha` (đã có trong `validate.ts`).
- Custom: opacity, blurPx, offsetX, offsetY chỉnh trong inspector.

### 5.5 Executor engine
- Topological sort; mỗi node có `runState: idle | stale | queued | running | done | error`.
- `cacheKey = hash(params + cacheKey các node upstream)`; đổi param → đánh dấu `stale` downstream, không chạy lại node không đổi.
- Hỗ trợ "Run all" và "Run từ node này".
- Executor gọi API qua Route Handler: flat dùng `/api/generate` hiện có; composed dùng route mới `app/api/flow/generate-background/route.ts` (Q8A), tái sử dụng `requireUser`, `createRateLimiter`, `readJsonWithSizeLimit`, model profile trong `lib/gemini-server.ts` (chỉ import, không sửa). Nếu một lần chạy có thể vượt timeout serverless: ghi vào QUESTIONS.md đề xuất job queue (Inngest/QStash/Vercel Workflow), chưa tự thêm hạ tầng.

### 5.6 UI canvas
- Layout 3 cột: Node library (trái, kéo thả) · Canvas · Inspector (phải, node đang chọn).
- Node card: header (icon + label + run state), ports theo màu của `PortType`, param ngắn inline (ratio, model), param dài ở inspector, vùng preview output.
- Run state: stale = viền cảnh báo, running = shimmer, error = message + nút Retry tại node, done = preview.
- Kéo dây sai: dùng `canConnect()` cho `isValidConnection`, hiện `REJECT_MESSAGES` dạng toast (Sonner).
- Không bao giờ mở canvas trống: mặc định load template.
- Theo design token/component hiện có của app, không tự đặt bảng màu mới.
- Accessibility: điều hướng bàn phím giữa node, nối port bằng phím, `aria-label` cho node và port, focus ring rõ, tôn trọng `prefers-reduced-motion`.
- Copy UI tiếng Việt, kỹ thuật, ngắn, không mơ hồ.
- Naming: component PascalCase, class CSS kebab-case, BEM trong CSS module.

### 5.7 Simple view
- Template = graph + danh sách `exposed: { nodeId, paramKey, label }[]`.
- Simple view render form từ `exposed`; sửa ở đây ghi thẳng vào graph.
- Nút "Mở canvas" chuyển sang Canvas view cùng graph.

### 5.8 Persistence + migration
- Bảng/cột lưu `StoredFlowDoc` (JSONB). Migration DB theo cách repo đang làm (tìm helper `pool`).
- Asset upload lên kho lưu bền (Q7A) khi thêm node asset; graph chỉ giữ URL bền, không giữ `blob:` hay `dataUrl`.
- App cũ không lưu project nên không có dữ liệu migrate (Q5). Thay bằng nút "Mở trong canvas" trên form: state editor → `GenerationRequest` → `fromLegacyConfig` → `decompileJob`.

### 5.9 Analytics
Dùng `lib/analytics-events.ts`. Event mới: `flow_opened`, `flow_run_started` (aiCalls), `flow_run_completed` (durationMs, renderMode), `flow_run_failed` (code), `flow_view_switched` (simple/canvas), `flow_template_used`.

## 6. Quy tắc làm việc cho Claude Code

1. Đầu phiên: đọc file này + `docs/flow/QUESTIONS.md`; chạy `npx vitest run lib/flow store` để chắc nền đang xanh.
2. Làm **một task** mỗi lần, theo thứ tự mục 8. Task bị chặn bởi câu hỏi chưa trả lời → bỏ qua, làm task kế tiếp không phụ thuộc.
3. Trước khi code: tìm và đọc file liên quan trong repo. Không đoán API.
4. Sau mỗi task: test + `npx tsc --noEmit` pass → tick checklist mục 8 → commit `feat(flow): <task id> <mô tả>`.
5. Không tự thêm dependency lớn hoặc hạ tầng (queue, DB mới) khi chưa được duyệt trong QUESTIONS.md.
6. Không sửa file pipeline cũ (mục 2.2) nếu task không ghi rõ.
7. Khi kết thúc phiên: viết 3–5 dòng tóm tắt vào mục 10.

## 7. Lệnh kiểm tra

```bash
npx vitest run lib/flow store   # khớp lib/flow, lib/flow-ui, store/__tests__ (lọc theo chuỗi con của đường dẫn)
npx tsc --noEmit
npm run dev   # mở /flow, cần FLOW_CANVAS=on trong .env.local
```

## 8. Task list

### Bước 1 – Đóng nền domain
- [x] **T1.1** Đọc `GenerationRequest` và payload form gửi `/api/generate`; ghi bảng mapping vào `lib/flow/legacy/README.md`; sửa `lib/flow/schema.ts` khớp type thật (Q6): `ModelId` → `ImageGenerationModel`, `StyleControls`, `MarketingBrief`, đủ `AssetRole`, `BrandKit` inline, `RatioSpec` theo preset id + `platform`/`name`
- [x] **T1.1b** Bỏ node `harmony-pass`; `generate-flat` có `aiCallsPerRatio = 2`; cập nhật compiler/decompiler/`estimateAiCalls`/test (Q4)
- [x] **T1.2** `from-legacy-config.ts` + test
- [x] **T1.3** `to-legacy-config.ts` + test
- [x] **T1.4** Thay fixture giả bằng ≥3 payload `GenerationRequest` thật log từ form chạy local (bỏ `dataUrl`, ẩn dữ liệu nhạy cảm), bổ sung case tự dựng nếu thiếu (Q1); round-trip `legacy → job → graph → job → legacy` khớp
- [x] **T1.5** Thiết kế model text layer mới (font family/weight/size, line-height, color, align, max lines…) thay `typography: Record<string, unknown>` (Q2)

### Bước 2 – Canvas chạy được 1 path
- [x] **T2.1** `lib/flow-ui/rf-adapter.ts`: FlowNode/FlowEdge ↔ React Flow node/edge (handle id = port id)
- [x] **T2.2** `flow-store.ts` giữ `FlowGraph` domain; `onConnect` dùng `canConnect`, lỗi → toast
- [x] **T2.3** Node component chung `FlowNodeCard` render từ `NODE_DEFINITIONS` (ports, label, run state)
- [x] **T2.4** Node library kéo thả + Inspector cơ bản
- [ ] **T2.5** Layout engine bản tối thiểu (1 variant/ratio class, chưa co giãn) để path chạy được
- [ ] **T2.6** Executor tối thiểu: Run all → compile → toLegacyConfig → gọi API hiện có → hiển thị kết quả
- [ ] **T2.7** Parity check: cùng config, form và canvas cho kết quả tương đương (ghi kết quả vào mục 10)

### Bước 3 – Design (Nghiệp làm trên Figma, Claude Code chỉ đọc)
- [ ] **T3.1** Khi có link/ảnh Figma trong QUESTIONS.md: cập nhật `FlowNodeCard`, layout 3 cột theo design

### Bước 4 – Đủ parity
- [ ] **T4.1** Layout engine đầy đủ (variant, co giãn, báo lỗi không vừa, override theo ratio) + test
- [ ] **T4.2** Layout guide image + prompt Generate BG theo 5.3, qua route mới `/api/flow/generate-background` (Q8A); quyết cách dùng chung rate limit với `/api/generate` trước khi code
- [ ] **T4.3** Compose (viết mới, Canvas 2D) + auto shadow theo 5.4
- [ ] **T4.4** Text renderer Canvas 2D mới (dùng chung preview/export/layout), `renderSource` cho headline; thêm 4–5 font Google có subset tiếng Việt qua `next/font`, map theo `fontStyle` vào `FLOW_FONTS` (Q10B)
- [ ] **T4.5** Brand kit, Reference image (harmony pass đã nằm trong `generate-flat`, Q4)
- [ ] **T4.6** Export nhiều ratio, chọn subset
- [ ] **T4.7** Executor: cache, stale, Run từ node, hiển thị `estimateAiCalls` trước Run

### Bước 5 – Simple view + template
- [ ] **T5.1** Cấu trúc template + `exposed`
- [ ] **T5.2** `SimpleView` sinh form từ `exposed`, chuyển qua lại với Canvas view
- [ ] **T5.3** 3–5 template mặc định (product hero, sale đa ratio, social post)
- [ ] **T5.4** Mở `/flow` luôn load template, không có canvas trống

### Bước 6 – Migration + rollout
- [ ] **T6.1** Kho lưu asset bền (Q7A, chọn Vercel Blob hay S3/R2 trước) + bảng/cột lưu StoredFlowDoc + API lưu/tải graph; `FlowAsset.url` là URL bền thay cho `blob:`
- [ ] **T6.2** Nút "Mở trong canvas" trên form cũ: state editor → `fromLegacyConfig` → `decompileJob` (Q5)
- [ ] **T6.3** Analytics events mục 5.9
- [ ] **T6.4** Flag theo % user (thay allowlist)
- [ ] **T6.5** Chỉ khi Nghiệp duyệt số liệu: chuyển entry chính sang `/flow`, gỡ form

### Ngoài phạm vi P1
Branching/so sánh variant, outpaint dùng chung background cho nhiều ratio, suy luận hướng sáng, AI relight, agent tự dựng graph, cộng tác realtime.

## 9. Khi bị chặn

Ghi vào `docs/flow/QUESTIONS.md`:
```
## Q<n> – <tiêu đề> (task T…)
Bối cảnh: …
Lựa chọn: A … / B …
Đề xuất: …
Trạng thái: chờ Nghiệp
```
Rồi chuyển sang task khác không phụ thuộc.

## 10. Nhật ký phiên

<!-- Claude Code ghi vào đây cuối mỗi phiên: ngày, task đã xong, kết quả test, việc tiếp theo -->

- **2026-10-12** – Xong T1.1. Schema khớp `lib/types.ts` (Q6A): `ModelId = ImageGenerationModel`, `RatioSpec = CanvasConfig + id`, asset node mang `FlowAsset` (role pixel: image/logo/decoration; role tham chiếu: style-reference/background), `brand-kit = BrandKit`, `style = StyleControls` bỏ `strictPreserveMode`, brief có `marketingBrief`, export theo `exportBanner()`. Mapping ở `lib/flow/legacy/README.md`. 21 test pass, tsc pass. Thêm Q7 (kho lưu asset), Q8 (route composed). Tiếp theo: T1.1b.
- **2026-10-12** – Xong T1.1b (Q4B). Bỏ node `harmony-pass` khỏi schema/registry/compiler/decompiler; `generate-flat.aiCallsPerRatio = 2`; `estimateAiCalls` đọc `aiCallsPerRatio` từ `NODE_DEFINITIONS`; bỏ `CompiledJob.flat.harmonyPass`. 21 test pass, tsc pass. Tiếp theo: T1.2.
- **2026-10-12** – Xong T1.2. `lib/flow/legacy/from-legacy-config.ts`: `fromLegacyConfig(request, { form? }) → { job, runtime }`, tách text bằng `splitComposedPrompt()` (test đối chiếu với `composeUserPrompt` thật), asset chia theo role, `dataUrl`/`layoutAdaptationFromBanner` vào `runtime`. Thêm `vitest.config.mts` (alias `@/`). 38 test pass, tsc pass. Tiếp theo: T1.3.
- **2026-10-12** – Xong T1.3. `lib/flow/legacy/to-legacy-config.ts`: `toLegacyConfig(job, runtime)` → 1 `GenerationRequest`/ratio + warnings (`missing-asset-data`, `unmapped-text`), composed → lỗi. Round-trip request → job → graph → job → request khớp; request sinh ra qua `parseGenerationRequest` của server. Thêm Q9 (text layer không map được). 50 test pass, tsc pass. Tiếp theo: T1.4 (cần log payload thật từ form, Q1).
- **2026-10-12** – Xong T1.4. 4 payload thật log từ form (làm sạch id/url/fileName/dataUrl) + 1 payload tự dựng phủ đủ 5 asset role, backgroundConfig, brand kit, canvas custom, `layoutAdaptationFromBanner` (`lib/flow/__tests__/fixtures/legacy/`). Mỗi fixture: server parse được, tách text từ prompt = lấy từ form, round-trip legacy → job → graph → job → legacy khớp. `flatLegacy` giờ sinh từ payload thật. Đã gỡ route và khối log tạm. 71 test pass, tsc pass. Tiếp theo: T1.5.
- **2026-10-12** – Xong T1.5, đóng bước 1. `lib/flow/text/text-style.ts`: `TextStyle` (font registry `FLOW_FONTS`, weight, italic, cỡ/giãn dòng/letter-spacing, transform, align, maxLines, fill, stroke, shadow, plate), mặc định theo role, `validateTextStyle` → lỗi `text-style-invalid` trong `validateGraph`. `text-layer.style` thay `typography`. Thêm Q10 (bộ font). 82 test pass, tsc pass. Tiếp theo: T2.1.
- **2026-10-12** – Xong T2.1. `lib/flow-ui/rf-adapter.ts`: `toRFNode`/`fromRFNode` (RF `type` = NodeType, `data.params`), `toRFEdge`/`fromRFEdge` (handle id = port id), `graphToRF`/`rfToGraph`, `toConnectionAttempt` (cho `isValidConnection`/`onConnect`), `attemptToEdge`. Thêm `makeEdgeId` vào `schema.ts` (decompiler dùng chung). Field riêng của RF không đi ngược vào domain. 91 test pass, tsc pass. Tiếp theo: T2.2.
- **2026-10-15** – Xong T2.2. `store/flow-store.ts` giữ `graph` domain; trạng thái hiển thị của RF (selected, dragging, measured) để riêng trong `nodeUi`/`edgeUi`, RF nodes/edges dẫn xuất qua `selectRFNodes`/`selectRFEdges`; đổi ui không tạo object graph mới. `connect()` chạy `canConnect`; `lib/flow-ui/connection-feedback.ts` dùng cùng luật cho `isValidConnection` và toast Sonner khi thả dây vào handle sai (kể cả kéo ngược input → output). Xoá node xoá luôn edge nối vào. `/flow` compile, chưa đăng nhập → 307 về /sign-in. 102 test pass, tsc pass. Chưa xem được canvas trên trình duyệt vì cần đăng nhập; graph vẫn rỗng cho tới T2.3/T2.4. Tiếp theo: T2.3.
- **2026-10-15** – Xong T2.3. `components/flow/nodes/FlowNodeCard.tsx` dùng chung cho 12 node type: header (icon lucide + nhãn + trạng thái chạy), tóm tắt params (`lib/flow-ui/node-summary.ts`, nhãn model/style lấy từ form cũ), port theo `NODE_DEFINITIONS` (handle id = port id, màu theo `PortType` từ bảng Tailwind, `*` bắt buộc, `+` nhiều kết nối), stale = viền amber, running = shimmer (tắt khi reduced-motion), error = message + nút Thử lại (hiện khi canvas cấp `onRetry`, T2.6), done = preview. Nhãn node/port tiếng Việt (`PORT_TYPE_LABELS`), thêm `lib/flow/run-state.ts`, store có `runInfo`. a11y: `ariaLabel` node = nhãn + tóm tắt, `aria-label` cho từng port, focus ring. Kiểm tra trên trang xem thử tạm (đã xoá): 15 node, 20 dây, kéo dây sai kiểu → toast "Hai port khác kiểu dữ liệu.", không thêm dây. **Còn thiếu** cho 5.6: nối port bằng bàn phím (React Flow không có sẵn), làm cùng T3.1 hoặc T4. 109 test pass, tsc pass. Tiếp theo: T2.4.
- **2026-10-15** – Xong T2.4. Layout 3 cột trong `FlowCanvas`. `NodeLibrary`: 12 node chia 5 nhóm, kéo thả (MIME `application/x-zvas-flow-node`) hoặc bấm/Enter để thêm vào giữa vùng đang nhìn, badge số lần gọi AI. `inspector/Inspector.tsx`: editor cơ bản cho cả 12 node type (asset upload + role, brief + chip mục tiêu/chủ thể, text layer, brand kit, kích thước theo preset, style, model + tuỳ chọn executor, bóng, export), hiện lỗi/cảnh báo `validateGraph` của node đang chọn. Dùng lại `Select`/`Input`/`Textarea`/`Button` và option của form cũ (export thêm `INTENT_OPTIONS`/`FOCAL_OPTIONS` từ `MarketingBriefChips`, không đổi hành vi form). Store: `addNode` (id `n-<type>-<k>`), `updateNodeParams`, `assetData` (dataUrl lúc chạy, không persist), `freePosition`, `selectSingleSelectedNode`. Kiểm tra trên trang xem thử tạm (đã xoá): thêm node bằng bấm và kéo thả, sửa prompt → tóm tắt node cập nhật, thêm kích thước, upload ảnh PNG, Inspector báo thiếu input. Sửa 2 lỗi phát hiện khi xem: `fitView` trên canvas rỗng phóng to 200% (giới hạn 100%), node thêm liên tiếp chồng nhau (lệch chéo 32px). Chưa có: kích thước custom, backgroundConfig, chỉnh tay layout (bước 4). 115 test pass, tsc pass. Tiếp theo: T2.5.
