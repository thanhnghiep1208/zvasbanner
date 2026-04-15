# API Reference

## 1) POST `/api/generate`

Tao 1 banner image tu prompt + assets.

### Request body (rut gon)

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
  "userPrompt": "Banner khuyen mai...",
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

### Success response

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

### Placeholder fallback response

```json
{
  "image": "data:image/svg+xml;charset=utf-8,...",
  "source": "placeholder",
  "meta": {
    "model": "gemini-3.1-flash-image-preview",
    "elapsedMs": 45001
  },
  "failedStep": "gemini-3.1-flash-image-preview",
  "placeholderError": "Model generation failed at step gemini-3.1-flash-image-preview: ..."
}
```

### Error response

- `400`: invalid JSON hoac invalid body
- `500`: missing `GEMINI_API_KEY`

## 2) POST `/api/enhance-prompt`

Cai thien prompt text truoc khi generate.

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

### Success response

```json
{
  "enhancedPrompt": "..."
}
```

## 3) GET `/api/proxy-image?url=<encoded-url>`

Proxy image remote de tranh CORS khi load vao canvas.

### Behavior

- Validate URL de giam rui ro SSRF.
- Forward image bytes + content-type.
- Su dung cache-control cho response proxy.

## 4) POST `/api/track`

Ghi mot event analytics vao PostgreSQL (bang `banner_events`). Can `DATABASE_URL` tren server.

### Bat buoc trong body

- `event` — mot trong: `select_canvas`, `upload_asset`, `input_content`, `select_style`, `generate_banner`, `regenerate_banner`, `preview_banner`, `export_banner`
- `banner_id` — string
- `user_id` — string (vi du Clerk `userId`)
- `timestamp` — number (Unix ms)

### Truong tuy chon (duoc map neu dung dung kieu)

- `style`, `canvas_size` (string)
- `has_asset`, `exported` (boolean)
- `generation_time_ms`, `regenerate_count`, `cost_usd` (number)

Cac field khac trong JSON bi bo qua khi insert.

### Success

```json
{ "ok": true }
```

### Loi

- `400`: JSON invalid hoac thieu/sai `event` | `banner_id` | `user_id` | `timestamp`
- `500`: loi insert DB (xem server log)

## 5) GET `/api/dashboard`

Tra ve so lieu tong hop tu toan bo `banner_events`. Can `DATABASE_URL`.

### Success response

```json
{
  "total_generated": 120,
  "total_previewed": 80,
  "total_exported": 35,
  "export_rate": 0.2916666666666667,
  "avg_regenerate": 0.5,
  "avg_generation_time": 12000.3,
  "total_cost": 1.234567,
  "current_period_cost": 0.12,
  "previous_period_cost": 0.09
}
```

- `total_generated` / `total_previewed` / `total_exported`: dem theo `event_name` tuong ung (`generate_banner`, `preview_banner`, `export_banner`).
- `export_rate`: `total_exported / total_generated` (0 neu khong co generate).
- `current_period_cost` / `previous_period_cost`: tong `cost_usd` trong 24h gan nhat / 24h truoc do (dung cho canh bao trend).

### Loi

- `500`: query aggregate that bai (DB down, sai schema, thieu `DATABASE_URL`).

## Luu y implementation

- Image generation model lock: `gemini-3.1-flash-image-preview`.
- Khi fail generate, server tra placeholder + thong tin loi chi tiet de UI hien thi ro buoc loi.
- `meta.totalTokens` / `meta.costUsd` co the absent tuy response tu model (cost la uoc luong tu usage).

