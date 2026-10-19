/**
 * Gọi model văn bản cho "Gợi ý chữ từ brief". Không dùng runGeminiEnhance (lib/gemini-server.ts): model đầu danh
 * sách của nó là model ảnh, trả lời kiểu chat thay vì JSON và mất ~30s (đo 2026-10-19). Ở đây dùng model Flash
 * văn bản, bắt buộc JSON (responseMimeType), fallback model kế khi lỗi/rỗng, tổng timeout 25s.
 */
import { GoogleGenerativeAI, SchemaType, type GenerationConfig, type ResponseSchema } from '@google/generative-ai';
import { buildCopyPrompt, parseCopyResponse, type CopySuggestInput, type CopyVariant } from '@/lib/flow/copy-suggest';

const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash'] as const;
const TIMEOUT_MS = 25_000;

const str = { type: SchemaType.STRING } as const;
const SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    variants: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.OBJECT, properties: { headline: str, subheadline: str, cta: str }, required: ['headline', 'subheadline', 'cta'] },
    },
  },
  required: ['variants'],
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function suggestCopy(apiKey: string, input: CopySuggestInput): Promise<CopyVariant[]> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const prompt = buildCopyPrompt(input);
  const deadline = Date.now() + TIMEOUT_MS;
  let lastErr: unknown;
  for (const name of MODELS) {
    const remaining = deadline - Date.now();
    if (remaining < 1000) break;
    try {
      const model = genAI.getGenerativeModel({
        model: name,
        // thinkingBudget 0: viết 3 câu quảng cáo không cần suy luận dài – nhanh hơn nhiều. SDK 0.24 chưa có kiểu này.
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.9,
          thinkingConfig: { thinkingBudget: 0 } } as GenerationConfig,
      });
      const res = await withTimeout(model.generateContent(prompt), remaining);
      const variants = parseCopyResponse(res.response.text() ?? '');
      if (variants.length) return variants;
      lastErr = new Error('empty');
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr instanceof Error && lastErr.message === 'empty') return [];
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
