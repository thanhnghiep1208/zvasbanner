## 1. Types & Store

- [x] 1.1 Thêm `CampaignIntent`, `FocalSubject`, `IndustryContext`, `MarketingBrief` vào `lib/types.ts`
- [x] 1.2 Thêm `marketingBrief?: MarketingBrief` vào interface `GenerationRequest` trong `lib/types.ts`
- [x] 1.3 Thêm `marketingBrief` state và `setMarketingBrief` action vào `store/editor.ts` với default `{ campaignIntents: [], focalSubjects: [], industries: [] }`

## 2. Prompt Builder

- [x] 2.1 Thêm `INTENT_PHRASES`, `FOCAL_PHRASES`, `INDUSTRY_PHRASES` maps vào `lib/prompt-builder.ts`
- [x] 2.2 Mở rộng `buildContextBlock()` nhận `marketingBrief` — inject industry phrases vào Layer 2 khi `industries` không rỗng
- [x] 2.3 Mở rộng `buildStylePhrase()` nhận `marketingBrief` — append campaign intent phrase vào Layer 3 khi `campaignIntents` không rỗng
- [x] 2.4 Mở rộng `buildStylePhrase()` — append focal subject directive vào Layer 3 khi `focalSubjects` không rỗng
- [x] 2.5 Cập nhật `assembleFullPrompt()` truyền `marketingBrief` vào `buildContextBlock()` và `buildStylePhrase()`
- [x] 2.6 Kiểm tra backward compat: `marketingBrief` undefined hoặc all-empty → output giống hệt trước

## 3. Style Suggestion Logic

- [x] 3.1 Tạo `lib/style-suggestions.ts` với `INTENT_SUGGESTIONS` map và hàm `getStyleSuggestions(intents: CampaignIntent[])`

## 4. UI — Chip Groups

- [x] 4.1 Tạo component `MarketingBriefChips` (hoặc inline vào `PromptInput`) với 3 chip groups: Mục tiêu, Nhân vật chính, Ngành
- [x] 4.2 Implement multi-select toggle: click chip active → thêm vào array; click lại → xóa khỏi array
- [x] 4.3 Kết nối chip state với `setMarketingBrief` trong Zustand store
- [x] 4.4 Đặt chip groups vào `PromptInput.tsx` — dưới CTA input, trên textarea

## 5. UI — Pill Summary

- [x] 5.1 Implement pill summary component bên dưới textarea: hiển thị selections ngăn cách bởi ` · `
- [x] 5.2 Ẩn pill hoàn toàn khi cả 3 fields đều empty

## 6. UI — Style Suggestion Badge

- [x] 6.1 Đọc `marketingBrief.campaignIntents` trong `StyleControls.tsx` và tính suggestion từ `getStyleSuggestions()`
- [x] 6.2 Hiển thị badge "Gợi ý: X" cạnh mood selector khi suggestion khác với `styleControls.mood` hiện tại
- [x] 6.3 Hiển thị badge "Gợi ý: X" cạnh style selector khi suggestion khác với `styleControls.style` hiện tại
- [x] 6.4 Khi click badge mood → gọi `setStyleControls({ mood: suggested })` → badge biến mất
- [x] 6.5 Khi click badge style → gọi `setStyleControls({ style: suggested })` → badge biến mất

## 7. Wire-up & Integration

- [x] 7.1 Cập nhật `lib/client-generation.ts` đọc `marketingBrief` từ store và truyền vào `GenerationRequest`
- [x] 7.2 Kiểm tra `validate-generation.ts` — accept `marketingBrief` optional, không break validation hiện tại

## 8. Verification

- [x] 8.1 Test backward compat: generate không chọn brief nào → output và behavior giống hệt trước
- [x] 8.2 Test flash sale + sản phẩm + F&B: kiểm tra prompt assembled chứa đúng 3 phrases ở đúng layer
- [x] 8.3 Test multi-select: 2 intents → cả 2 phrases concat trong Layer 3
- [x] 8.4 Test badge: chọn flash-sale, mood hiện tại calm → badge "Gợi ý: Năng động" xuất hiện; click → mood = energetic, badge biến mất
- [x] 8.5 Test badge không auto-apply: chọn flash-sale → StyleControls không tự đổi mood
- [x] 8.6 Test pill: chọn 1 chip → pill xuất hiện; deselect hết → pill ẩn
