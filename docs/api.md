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
    "totalTokens": 2440
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

## Luu y implementation

- Image generation model lock: `gemini-3.1-flash-image-preview`.
- Khi fail generate, server tra placeholder + thong tin loi chi tiet de UI hien thi ro buoc loi.
- `meta.totalTokens` co the absent tuy response tu model.

