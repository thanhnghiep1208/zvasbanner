## Why

User marketing cần tạo banner nhanh nhưng kết quả thường sai focal point và sai vibe vì prompt free-form quá ngắn và vague — model tự quyết các dimension quan trọng như mục tiêu campaign, nhân vật chính, và ngành hàng. Thêm structured fields giúp capture đúng intent mà không tăng friction cho user không có kinh nghiệm design.

## What Changes

- Thêm 3 chip-select fields mới vào `PromptInput`: **Mục tiêu banner**, **Nhân vật chính**, **Ngành** — tất cả optional, multi-select
- Khi chọn intent (Flash sale, Ra mắt…), StyleControls hiển thị badge **"Gợi ý"** cho mood/style phù hợp — user chủ động click để apply, không tự override
- Pill summary bên dưới textarea hiển thị brief đã chọn ("flash sale · sản phẩm · F&B") để user confirm cái gì được inject
- `buildContextBlock()` nhận thêm `industryContext` → inject visual language phrase vào Layer 2
- `buildStylePhrase()` nhận thêm `campaignIntent` + `focalSubject` → inject campaign/focal directives vào Layer 3
- Không chọn gì = hành vi hoàn toàn như cũ (backward compatible)

## Capabilities

### New Capabilities

- `marketing-brief-input`: UI chip-select fields cho campaign intent, focal subject, industry context — multi-select, optional, với pill summary feedback
- `brief-to-prompt-injection`: Map các brief fields thành prompt phrases và inject vào đúng layer (Layer 2: industry, Layer 3: intent + focal)
- `style-suggestion-from-intent`: Khi user chọn campaign intent, hiển thị badge gợi ý mood/style trong StyleControls — user click để apply

### Modified Capabilities

_(không có — prompt pipeline mở rộng, không thay đổi behavior cũ)_

## Impact

**Code:**
- `lib/types.ts` — thêm `MarketingBrief` type vào `GenerationRequest`
- `store/editor.ts` — thêm `marketingBrief` state
- `lib/prompt-builder.ts` — mở rộng `buildContextBlock()` và `buildStylePhrase()`
- `components/prompt/PromptInput.tsx` — thêm 3 chip sections + pill summary
- `components/prompt/StyleControls.tsx` — thêm badge "Gợi ý" logic

**Không ảnh hưởng:** API routes, database schema, Gemini model selection, asset pipeline, export flow.
