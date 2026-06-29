## Context

Hiện tại `GenerationRequest` nhận `userPrompt` (free-form text) + `StyleControls` (aesthetic dimensions: style/mood/palette/font). Không có dimension nào capture marketing intent, focal subject, hay industry context — model tự suy ra từ text ngắn, dẫn đến sai focal point và vibe.

Pipeline inject user input vào Layer 3 (Creative Direction) và Layer 4 (User Brief). Thiết kế này thêm 2 injection points mới vào Layer 2 và Layer 3 mà không phá vỡ pipeline hiện tại.

## Goals / Non-Goals

**Goals:**
- Thêm 3 optional chip-select fields: campaign intent, focal subject, industry context
- Multi-select cho cả 3 fields (vd: Flash sale + Sự kiện = sale Tết)
- Inject phrases vào đúng prompt layer tương ứng
- Badge "Gợi ý" trong StyleControls khi chọn intent — user click để apply, không tự override
- Pill summary feedback bên dưới textarea
- Backward compatible: không chọn gì = hành vi cũ

**Non-Goals:**
- Không thay đổi API routes hay database schema
- Không làm required validation (không có error state)
- Không tự động override StyleControls mà không có user action
- Không thêm ngành mới ngoài 6 ngành ban đầu (có thể mở rộng sau)

## Decisions

### D1 — Data model: thêm `marketingBrief` vào `GenerationRequest`

```ts
// lib/types.ts

export type CampaignIntent =
  | "flash-sale"
  | "product-launch"
  | "brand-awareness"
  | "event";

export type FocalSubject =
  | "product"
  | "person"
  | "text"
  | "scene";

export type IndustryContext =
  | "fashion"
  | "fnb"
  | "tech"
  | "beauty"
  | "finance"
  | "education";

export interface MarketingBrief {
  campaignIntents: CampaignIntent[];   // multi-select, empty = not set
  focalSubjects: FocalSubject[];       // multi-select, empty = not set
  industries: IndustryContext[];       // multi-select, empty = not set
}

// Thêm vào GenerationRequest:
export interface GenerationRequest {
  // ... existing fields ...
  marketingBrief?: MarketingBrief;     // optional, undefined = backward compat
}
```

**Lý do dùng arrays:** Multi-select theo yêu cầu. Empty array = không chọn, xử lý như undefined.

---

### D2 — Store: thêm `marketingBrief` vào Zustand

```ts
// store/editor.ts — thêm vào EditorStore

marketingBrief: MarketingBrief;
setMarketingBrief: (patch: Partial<MarketingBrief>) => void;

// Default:
marketingBrief: { campaignIntents: [], focalSubjects: [], industries: [] }
```

---

### D3 — Prompt injection: 2 điểm inject

**Layer 2 — `buildContextBlock()`** nhận thêm `marketingBrief`:

```ts
// Chỉ inject khi có giá trị
if (brief?.industries?.length) {
  lines.push("Industry context");
  for (const ind of brief.industries) {
    lines.push(`- ${INDUSTRY_PHRASES[ind]}`);
  }
}
```

**Layer 3 — `buildStylePhrase()`** nhận thêm `marketingBrief`:

```ts
// Append sau style/mood/palette/font phrases
if (brief?.campaignIntents?.length) {
  parts.push(`Campaign intent: ${brief.campaignIntents.map(i => INTENT_PHRASES[i]).join(" + ")}`);
}
if (brief?.focalSubjects?.length) {
  parts.push(`Focal subject: ${brief.focalSubjects.map(f => FOCAL_PHRASES[f]).join(", ")}`);
}
```

---

### D4 — Phrase maps (nguồn sự thật cho prompt quality)

```ts
// lib/prompt-builder.ts

const INTENT_PHRASES: Record<CampaignIntent, string> = {
  "flash-sale":
    "Urgency-forward composition: bold discount callout prominent, high-contrast warm accent color, time-pressure visual energy, eye-catching over refined.",
  "product-launch":
    "Premium reveal aesthetic: hero product dominant and well-lit, clean aspirational atmosphere, sense of unveiling something new.",
  "brand-awareness":
    "Brand storytelling over hard sell: emotional resonance, narrative composition, visual cohesion with brand identity takes priority.",
  "event":
    "Celebratory atmosphere: festive warmth, seasonal or occasion-relevant motifs used sparingly, inviting and energetic feel.",
};

const FOCAL_PHRASES: Record<FocalSubject, string> = {
  "product":
    "Product must be the dominant subject: 55–70% of frame area, hero-lit from front-top, clean visual separation from background, no competing focal points.",
  "person":
    "Human figure or face is the primary focal point: expression or gesture leads the eye, product/environment plays supporting role.",
  "text":
    "Typography-first layout: headline text is the visual hero, imagery and graphics exist to frame and support the message, not compete with it.",
  "scene":
    "Atmospheric scene composition: wide establishing shot, product or subject integrated into environment, mood and setting carry the story.",
};

const INDUSTRY_PHRASES: Record<IndustryContext, string> = {
  "fashion":
    "Fashion industry visual language: editorial aesthetic, clean or gradient backgrounds, model-forward or flat-lay product styling, aspirational palette.",
  "fnb":
    "F&B visual language: warm appetizing color tones, natural food photography lighting, texture-forward surfaces, appetite-stimulating warm highlights.",
  "tech":
    "Tech industry visual language: dark or neutral UI-inspired aesthetic, precision and clarity, cool blue or electric accent tones, grid-based composition.",
  "beauty":
    "Beauty industry visual language: soft diffused lighting, skin-flattering warm tones, luxurious texture detail, clean and fresh backgrounds.",
  "finance":
    "Finance industry visual language: trustworthy and stable aesthetic, navy/slate/gold palette, structured grid layout, no frivolous decoration.",
  "education":
    "Education visual language: optimistic and accessible feel, bright primary or complementary accents, clear readable hierarchy, welcoming and energetic.",
};
```

**Lý do phrases dài và cụ thể:** Gemini multimodal image models phản ứng tốt hơn với visual descriptors cụ thể (lighting direction, color names, composition terms) hơn là labels ngắn ("F&B"). Phrases ngắn như "warm food tones" thường bị ignore nếu có context khác override.

---

### D5 — Badge "Gợi ý" trong StyleControls

Khi `campaignIntents` có giá trị, `StyleControls` hiển thị badge nhỏ bên cạnh mood/style selector tương ứng:

```
Mood     [Năng động ▼]  💡 Gợi ý: Năng động
Style    [Đậm nét ▼]    💡 Gợi ý: Đậm nét
```

**Logic suggest:**

```ts
// lib/style-suggestions.ts (file mới, nhỏ)

const INTENT_SUGGESTIONS: Record<CampaignIntent, Partial<Pick<StyleControls, "mood" | "style">>> = {
  "flash-sale":       { mood: "energetic", style: "bold" },
  "product-launch":   { mood: "professional", style: "luxury" },
  "brand-awareness":  { mood: "calm", style: "minimalist" },
  "event":            { mood: "festive", style: "playful" },
};

export function getStyleSuggestions(intents: CampaignIntent[]): Partial<Pick<StyleControls, "mood" | "style">> {
  // Lấy suggest của intent đầu tiên trong list (primary intent)
  if (!intents.length) return {};
  return INTENT_SUGGESTIONS[intents[0]] ?? {};
}
```

Badge hiển thị khi suggest khác với giá trị hiện tại. Click badge → `setStyleControls({ mood: suggested.mood })`. Badge biến mất khi user đã chọn giá trị đó.

**Lý do không auto-apply:** User chọn "Flash sale" nhưng brand luxury → muốn giữ mood: calm, style: luxury. Auto-apply sẽ override setting họ đặt có chủ đích. Badge là nudge, không phải force.

---

### D6 — Pill summary UI

```
● flash sale · sản phẩm · F&B
```

- Hiển thị ngay dưới textarea, trên nút action
- Ẩn hoàn toàn nếu cả 3 fields đều empty
- Dùng `·` separator, không có label dài
- Màu indigo nhạt (consistent với brand color của app)

**Lý do cần pill:** User marketing không đọc prompt thật — họ cần visual confirmation rằng lựa chọn của họ đã được "nghe". Không có feedback này, họ không tin hệ thống đang dùng brief của họ.

## Risks / Trade-offs

**[Risk] Multi-select intent mâu thuẫn** (vd: "Flash sale" + "Brand awareness" cùng lúc)
→ Mitigation: Phrases được concat với " + " — Gemini xử lý được conflicting intents bằng cách blend. Trong thực tế, ít user chọn 2 intent thực sự mâu thuẫn. Không cần validate.

**[Risk] Phrases quá dài làm tăng token count đáng kể**
→ Mitigation: Worst case (3 intents + 3 focals + 3 industries) thêm khoảng ~250 tokens vào prompt. Với model hiện tại cost ~$0.00015/1K tokens input, tăng không đáng kể. Chấp nhận được.

**[Risk] Phrases conflict với StyleControls user đã chọn**
→ Mitigation: Intent phrases inject vào sau style/mood phrases trong Layer 3 — model đọc sau và có thể override. Đây là hành vi mong muốn: brief cụ thể hơn thắng aesthetic chung chung.

**[Risk] Badge "Gợi ý" bị bỏ qua**
→ Mitigation: Đây là UX enhancement, không phải requirement. Nếu user bỏ qua badge, prompt vẫn được inject đúng từ brief. Badge chỉ là convenience.

## Open Questions

1. **Thứ tự chips trong multi-select có ảnh hưởng đến phrase concatenation không?**
   Hiện tại lấy `intents[0]` cho style suggestion. Nếu user chọn "Event" rồi "Flash sale", suggest sẽ là của Event. Có cần UI để reorder không? → Đề xuất: không cần cho v1, theo thứ tự click.

2. **Có nên persist brief vào localStorage không?**
   User quay lại session mới → brief reset về empty. Với marketing workflow lặp lại (cùng ngành, cùng intent), persist sẽ tiết kiệm thời gian. → Defer sang v2.
