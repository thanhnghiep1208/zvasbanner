# API Reference

Tài liệu mô tả **contract** các Route Handlers dưới `app/api/`. Mọi endpoint JSON nên gửi header `Content-Type: application/json` khi có body.

## Ghi chú chung

- **Model ảnh** (generate / edit): `gemini-3.1-flash-image-preview`.
- **Ảnh trả về**: thường là chuỗi **data URL** (`data:image/png;base64,...`) hoặc định dạng tương thích client (ví dụ thẻ img với `src` trỏ tới data URL).
- **Lỗi thân thiện + mã ngắn**: client có thể hiển thị tiền tố dạng `[E-GEN-…]`, `[E-ENH-…]`, `[E-EXP-…]`; server `edit-image` trả các mã kiểu `EDIT_TIMEOUT`, `EDIT_AUTH`, … trong trường `errorCode`. Chi tiết kỹ thuật thường nằm trong nội dung `error` hoặc log server.
- **Timeout**: generate/edit trên server có giới hạn thời gian (khoảng vài chục giây tùy route); quá hạn trả lỗi hoặc placeholder tùy luồng generate.

---

## 1) `POST /api/generate`

Tạo **một** banner từ prompt + assets (multimodal).

### Request body (rút gọn)

```json
{
  "canvasConfig": {
    "width": 1200,
    "height": 628,
    "platform": "Social Media",
    "name": "Facebook Ad"
  },
  "assets": [
    {
      "id": "asset-1",
      "url": "blob:http://...",
      "dataUrl": "data:image/png;base64,...",
      "fileName": "product.png",
      "role": "image",
      "hasAlpha": true,
      "originalDims": { "width": 1024, "height": 1024 }
    }
  ],
  "brandKit": {
    "colors": ["#111111", "#ffffff"]
  },
  "userPrompt": "Banner khuyến mãi...",
  "styleControls": {
    "style": "minimalist",
    "mood": "professional",
    "colorPalette": "auto",
    "fontStyle": "modern",
    "strictPreserveMode": true,
    "backgroundConfig": {
      "tones": [],
      "grains": [],
      "shapes": [],
      "effects": []
    }
  }
}
```

### Success — `200`

```json
{
  "image": "data:image/png;base64,...",
  "source": "gemini",
  "meta": {
    "model": "gemini-3.1-flash-image-preview",
    "elapsedMs": 8421,
    "promptTokens": 2100,
    "outputTokens": 340,
    "totalTokens": 2440,
    "costUsd": 0.000519
  }
}
```

`meta.totalTokens` / `meta.costUsd` có thể vắng tùy response model (cost thường là ước lượng).

### Placeholder fallback — `200` (ảnh dự phòng khi model lỗi)

```json
{
  "image": "data:image/svg+xml;charset=utf-8,...",
  "source": "placeholder",
  "meta": {
    "model": "gemini-3.1-flash-image-preview",
    "elapsedMs": 45001
  },
  "failedStep": "gemini-3.1-flash-image-preview",
  "placeholderError": "…",
  "errorCode": "GEMINI_TIMEOUT"
}
```

### Lỗi — `400` / `401` / `429` / `500` / `502` (tùy implementation)

- Body không phải JSON hợp lệ, thiếu field bắt buộc → `400`.
- Thiếu `GEMINI_API_KEY` trên server → `500`.

---

## 2) `POST /api/enhance-prompt`

Viết lại / cải thiện prompt text trước khi generate.

### Request body

```json
{
  "userPrompt": "Banner sale 50%",
  "canvasConfig": {
    "width": 1200,
    "height": 628,
    "platform": "Social Media",
    "name": "Facebook Ad"
  },
  "assets": []
}
```

### Success — `200`

```json
{
  "enhancedPrompt": "…"
}
```

### Lỗi

- `400`: JSON/body không hợp lệ.
- `500`: thiếu key hoặc lỗi server; message thường được phân loại (quota, timeout, auth, …).

---

## 3) `POST /api/edit-image`

Chỉnh sửa **ảnh đã tạo** (multimodal: ảnh hiện tại + hướng dẫn text). Không yêu cầu tạo lại composition hoàn toàn mới — prompt hệ thống ép giữ subject/composition, chỉ điều chỉnh nhẹ vị trí, góc, màu.

### Request body

```json
{
  "imageDataUrl": "data:image/png;base64,...",
  "editPrompt": "Đẩy sản phẩm sang trái một chút, ấm màu hơn",
  "canvasConfig": {
    "width": 1075,
    "height": 645,
    "platform": "Zalo",
    "name": "OA"
  }
}
```

- `imageDataUrl`: bắt buộc, bắt đầu bằng `data:image/`.
- `editPrompt`: bắt buộc, độ dài tối thiểu sau trim (server: ≥ 3 ký tự).
- `canvasConfig`: tùy chọn; dùng để bổ sung ngữ cảnh kích thước trong prompt.

### Success — `200`

```json
{
  "image": "data:image/png;base64,...",
  "source": "gemini",
  "meta": {
    "model": "gemini-3.1-flash-image-preview",
    "elapsedMs": 12000,
    "promptTokens": 0,
    "outputTokens": 0,
    "totalTokens": 0
  }
}
```

### Lỗi — `400` / `500` / `502`

- `400`: JSON lỗi; hoặc thiếu hoặc sai `imageDataUrl`, `editPrompt`.
- `500`: thiếu `GEMINI_API_KEY`.
- `502`: lỗi Gemini / timeout; body có thể gồm `error`, `errorCode` (`EDIT_TIMEOUT`, `EDIT_AUTH`, `EDIT_RATE_LIMIT`, `EDIT_UNKNOWN`), `meta`, `source: "error"`.

`maxDuration` route: 60s (Vercel / Next); timeout logic chỉnh sửa ~45s (xem code).

---

## 4) `GET /api/proxy-image`

- Đường dẫn: `GET /api/proxy-image?url=...` — tham số `**url**` là địa chỉ ảnh (chuỗi đã URL-encode, ví dụ `https%3A%2F%2F...`).

Proxy ảnh remote để **tránh CORS** khi vẽ lên canvas / export.

### Hành vi

- Validate URL giảm thiểu SSRF.
- Trả về bytes ảnh + `Content-Type` gốc (hoặc tương đương).
- Có header cache phù hợp cho proxy.

### Lỗi

- URL không hợp lệ hoặc không cho phép → `4xx`.
- Lỗi tải upstream → `5xx` / `4xx` tùy case.

---

## 5) `POST /api/track`

Ghi **một** event analytics vào PostgreSQL (`banner_events`). Cần `DATABASE_URL` trên server.

### Bắt buộc trong body

- `event` — một trong các tên đã định nghĩa trong `lib/analytics-events.ts` (ví dụ: `select_canvas`, `upload_asset`, `input_content`, `select_style`, `generate_banner`, `regenerate_banner`, `preview_banner`, `export_banner`).
- `banner_id` — string.
- `user_id` — string (ví dụ Clerk `userId`).
- `timestamp` — number (Unix **ms**).

### Tùy chọn (map vào cột DB nếu đúng kiểu)

- `style`, `canvas_size` (string)
- `has_asset`, `exported` (boolean)
- `generation_time_ms`, `regenerate_count`, `cost_usd` (number)

Field khác trong JSON có thể bị bỏ qua khi insert (tùy implementation route).

### Success — `200`

```json
{ "ok": true }
```

### Lỗi

- `400`: JSON invalid; thiếu/sai một trong các trường bắt buộc: `event`, `banner_id`, `user_id`, `timestamp`.
- `500`: lỗi DB / thiếu cấu hình pool.

---

## 6) `GET /api/dashboard`

Tổng hợp metrics từ `banner_events` trong **khoảng thời gian** lọc. Cần `DATABASE_URL`.

### Query parameters


| Param   | Giá trị              | Mặc định |
| ------- | -------------------- | -------- |
| `range` | `today`, `7d`, `30d` | `7d`     |


- `today`: từ 00:00 **UTC** của ngày hiện tại đến hiện tại.
- `7d` / `30d`: sliding window theo số ngày.

### Success — `200`

```json
{
  "total_generated": 120,
  "total_previewed": 80,
  "total_exported": 35,
  "export_rate": 0.2916666666666667,
  "avg_generation_time": 12000.3,
  "total_cost": 1.234567,
  "current_period_cost": 0.12,
  "previous_period_cost": 0.09
}
```

- `total_generated` / `total_previewed` / `total_exported`: đếm theo `event_name` tương ứng (`generate_banner`, `preview_banner`, `export_banner`) trong range.
- `export_rate`: `total_exported / total_generated` (0 nếu không có generate).
- `avg_generation_time`: trung bình `generation_time_ms` (theo aggregate hiện tại).
- `total_cost`: tổng `cost_usd` trong range.
- `current_period_cost` / `previous_period_cost`: tổng `cost_usd` trong **24h gần nhất** vs **24h trước đó** (dùng cho so sánh trend trên UI, không nhất thiết trùng với `range`).

### Lỗi — `500`

- Query lỗi, DB down, sai schema, thiếu `DATABASE_URL`.

---

## 7) `GET /api/dashboard/users`

Danh sách user có hoạt động generate (và export), **phân trang**, enrich tên/email từ **Clerk**. Cần `DATABASE_URL` và `CLERK_SECRET_KEY` hợp lệ để lấy danh tính.

### Query parameters


| Param   | Mô tả                                                         |
| ------- | ------------------------------------------------------------- |
| `range` | Giống `/api/dashboard`: `today`, `7d`, `30d` (mặc định `7d`). |
| `page`  | Số trang, bắt đầu từ `1` (mặc định `1`).                      |


Kích thước trang cố định **15** user/trang (xem `PAGE_SIZE` trong code).

### Success — `200`

```json
{
  "users": [
    {
      "user_id": "user_…",
      "user_name": "Nguyen Van A",
      "email": "a@example.com",
      "total_generate": 42,
      "total_export": 10
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 15,
    "totalUsers": 100,
    "totalPages": 7
  }
}
```

Chỉ gồm user có `total_generate > 0` trong khoảng lọc.

### Lỗi — `500`

- Lỗi SQL hoặc cấu hình DB.

---

## Liên kết

- [Development Guide](./development-guide.md) — env, workflow.
- [Deploy](./deploy.md) — Vercel, Clerk, domain.
- [Architecture](./architecture.md) — luồng hệ thống.

