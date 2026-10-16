/**
 * Gọi Gemini sinh nền cho composed mode (T4.2). Server-only.
 *
 * Không dùng geminiGenerateOneImage vì hàm đó gắn câu "giữ nguyên asset" cho mọi ảnh không phải
 * style-reference; ở đây guide image cần chỉ dẫn riêng ("bản đồ vùng trống, không vẽ lại").
 * Dùng chung bảng model + cách ước tính chi phí của lib/gemini-server.ts.
 */
import 'server-only';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  estimateGenerationCostUsd, GEMINI_IMAGE_TIMEOUT_MS, IMAGE_MODEL_MAP, type ImageGenerationMeta,
} from '@/lib/gemini-server';
import { buildBackgroundPrompt } from '@/lib/flow/background/prompt';
import type { BackgroundRequest } from '@/lib/flow/background/request';

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

function inline(dataUrl: string): Part {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('invalid data url');
  return { inlineData: { mimeType: m[1]!, data: m[2]! } };
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function generateBackground(
  apiKey: string,
  req: BackgroundRequest,
): Promise<{ image: string; meta: ImageGenerationMeta }> {
  const startedAt = Date.now();
  const modelId = IMAGE_MODEL_MAP[req.model];
  const prompt = buildBackgroundPrompt(req);

  const parts: Part[] = req.guideImage
    ? [
      { text: 'LAYOUT GUIDE (map of reserved zones – grey = keep clean, do not reproduce):' },
      inline(req.guideImage),
    ]
    : [];
  for (const r of req.references) {
    parts.push({
      text: r.role === 'style-reference'
        ? `REFERENCE BANNER (${r.fileName}): recreate its background, palette, lighting and decorative elements as closely as possible. Do not copy its text, logos, buttons, products or people.`
        : `BACKGROUND (${r.fileName}): base scene to adapt; keep reserved zones clean.`,
    });
    parts.push(inline(r.dataUrl));
  }
  parts.push({ text: `${prompt}\n\nOutput requirement: return one background image only.` });

  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: modelId });
  const result = await withTimeout(
    model.generateContent({ contents: [{ role: 'user', parts }] }),
    GEMINI_IMAGE_TIMEOUT_MS,
    `Gemini background ${modelId}`,
  );
  const imagePart = (result.response.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) throw new Error(`No image data in response from ${modelId}`);
  const usage = result.response.usageMetadata as
    | { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
    | undefined;
  return {
    image: `data:${imagePart.inlineData.mimeType ?? 'image/png'};base64,${imagePart.inlineData.data}`,
    meta: {
      model: modelId,
      elapsedMs: Date.now() - startedAt,
      promptTokens: usage?.promptTokenCount,
      outputTokens: usage?.candidatesTokenCount,
      totalTokens: usage?.totalTokenCount,
      costUsd: estimateGenerationCostUsd({
        promptTokens: usage?.promptTokenCount,
        outputTokens: usage?.candidatesTokenCount,
      }),
    },
  };
}
