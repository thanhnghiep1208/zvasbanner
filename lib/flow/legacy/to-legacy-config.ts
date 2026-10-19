/**
 * CompiledJob (renderMode 'flat') → GenerationRequest[] (body POST /api/generate), 1 request / ratio.
 * Ngược với from-legacy-config.ts. Bảng mapping đầy đủ: ./README.md
 *
 * | CompiledJob                         | GenerationRequest                                   |
 * |-------------------------------------|-----------------------------------------------------|
 * | ratios[i]                           | canvasConfig của request thứ i (bỏ id)              |
 * | products[] + references[]           | assets[] (products trước), dataUrl từ runtime       |
 * | brandKit?                           | brandKit (thiếu → { colors: [] })                   |
 * | brief.prompt + textLayers           | userPrompt (ghép như composeUserPrompt)             |
 * | style? + flat.strictPreserveMode    | styleControls (thiếu style → DEFAULT_STYLE)         |
 * | model                               | imageModel                                          |
 * | brief.marketingBrief                | marketingBrief                                      |
 * | runtime.layoutAdaptationFromBanner  | layoutAdaptationFromBanner (mọi request)            |
 *
 * Bỏ qua (chỉ dùng trong canvas): textLayers[].renderSource/priority/minFontSizePx/style,
 * composed.*, export.*.
 */
import { campaignLegacyLines } from '../brief';
import type { GenerationRequest, UploadedAsset } from '@/lib/types';
import type { CompiledJob } from '../compiled-job';
import { NODE_DEFINITIONS } from '../node-definitions';
import type { FlowAsset, NodeParamsMap, TextRole } from '../schema';
import { DEFAULT_STYLE } from '../schema';
import type { LegacyRuntime } from './from-legacy-config';

export interface LegacyIssue {
  code: 'composed-not-supported' | 'no-ratio' | 'missing-asset-data' | 'unmapped-text';
  message: string;
  /** assetId hoặc layerId liên quan. */
  refs?: string[];
}

export interface LegacyRequest {
  ratioId: string;
  request: GenerationRequest;
}

export type ToLegacyResult =
  | { ok: true; requests: LegacyRequest[]; warnings: LegacyIssue[] }
  | { ok: false; error: LegacyIssue };

/** Role text legacy có chỗ (headline / subheadline / ctaText trong store/editor.ts). */
const LEGACY_TEXT_ROLES = ['headline', 'subheadline', 'cta'] as const satisfies readonly TextRole[];

export function toLegacyConfig(
  job: CompiledJob,
  runtime: LegacyRuntime = { dataUrls: {} },
): ToLegacyResult {
  if (job.renderMode !== 'flat') {
    return { ok: false, error: { code: 'composed-not-supported',
      message: 'Composed chưa có API legacy tương ứng (cần route mới, Q8). Chỉ chạy được flat.' } };
  }
  if (job.ratios.length === 0) {
    return { ok: false, error: { code: 'no-ratio', message: 'Cần ít nhất 1 kích thước.' } };
  }

  const warnings: LegacyIssue[] = [];

  const flowAssets: FlowAsset[] = [...job.products, ...job.references];
  const missing = flowAssets.filter((a) => !runtime.dataUrls[a.assetId]).map((a) => a.assetId);
  if (missing.length) {
    warnings.push({ code: 'missing-asset-data', refs: missing,
      message: 'Thiếu dữ liệu ảnh (dataUrl): server sẽ bỏ qua ảnh này khi gọi Gemini. Hãy tải lại ảnh.' });
  }
  const assets = flowAssets.map((a) => toUploadedAsset(a, runtime.dataUrls[a.assetId]));

  const { text, unmapped } = pickLegacyText(job.textLayers);
  if (unmapped.length) {
    warnings.push({ code: 'unmapped-text', refs: unmapped,
      message: 'Form cũ chỉ có 1 headline, 1 subheadline, 1 CTA. Các text layer còn lại không được gửi.' });
  }
  // Brief marketing (brief.ts): form cũ chỉ có prompt tự do → ghép thành các dòng tiếng Việt trước mô tả nền.
  const briefText = [...campaignLegacyLines(job.brief.campaign), job.brief.prompt.trim()].filter(Boolean).join('\n');
  const userPrompt = composeLegacyPrompt({ userPrompt: briefText, ...text });

  const strictPreserveMode =
    job.flat?.strictPreserveMode ?? NODE_DEFINITIONS['generate-flat'].defaultParams.strictPreserveMode;
  const styleControls = { ...(job.style ?? DEFAULT_STYLE), strictPreserveMode };

  const requests = job.ratios.map(({ id, ...canvasConfig }): LegacyRequest => ({
    ratioId: id,
    request: {
      canvasConfig,
      assets,
      brandKit: job.brandKit ?? { colors: [] },
      userPrompt,
      styleControls,
      imageModel: job.model,
      ...(runtime.layoutAdaptationFromBanner
        ? { layoutAdaptationFromBanner: runtime.layoutAdaptationFromBanner }
        : {}),
      marketingBrief: job.brief.marketingBrief,
    },
  }));

  return { ok: true, requests, warnings };
}

/* ── Text ───────────────────────────────────────────────────── */

type LegacyText = { headline: string; subheadline: string; ctaText: string };

/**
 * Prompt thử lại cho kích thước phụ – cùng format `retryPrompt` trong components/canvas/AdditionalCanvasSizesPanel.tsx
 * (form cũ dùng khi lần thích nghi đầu thất bại/placeholder). Parity T4.6.
 */
export function adaptationRetryPrompt(job: CompiledJob): string {
  const { text } = pickLegacyText(job.textLayers);
  return [
    'Layout translation only: keep same campaign look and content hierarchy.',
    text.headline.trim() ? `Headline: ${text.headline.trim()}` : '',
    text.subheadline.trim() ? `Subheadline: ${text.subheadline.trim()}` : '',
    text.ctaText.trim() ? `CTA: ${text.ctaText.trim()}` : '',
  ].filter(Boolean).join('\n');
}

/** Lấy layer đầu tiên của mỗi role legacy; phần còn lại (role custom, role trùng) trả về `unmapped`. */
function pickLegacyText(layers: NodeParamsMap['text-layer'][]): { text: LegacyText; unmapped: string[] } {
  const picked = new Map<TextRole, string>();
  const unmapped: string[] = [];
  for (const l of layers) {
    const legacy = (LEGACY_TEXT_ROLES as readonly TextRole[]).includes(l.role);
    if (legacy && !picked.has(l.role)) picked.set(l.role, l.content);
    else unmapped.push(l.layerId);
  }
  return {
    text: {
      headline: picked.get('headline') ?? '',
      subheadline: picked.get('subheadline') ?? '',
      ctaText: picked.get('cta') ?? '',
    },
    unmapped,
  };
}

/**
 * Bản sao format của composeUserPrompt() trong lib/client-generation.ts.
 * Không import trực tiếp vì file đó kéo theo Zustand store (lib/flow phải thuần, SPEC 2.3).
 * Test `to-legacy.test.ts` so sánh với bản gốc để bắt lệch format.
 */
export function composeLegacyPrompt(input: { userPrompt: string } & LegacyText): string {
  const lines: string[] = [];
  const base = input.userPrompt.trim();
  if (base) lines.push(base);
  if (input.headline.trim()) lines.push(`Headline: ${input.headline.trim()}`);
  if (input.subheadline.trim()) lines.push(`Subheadline: ${input.subheadline.trim()}`);
  if (input.ctaText.trim()) lines.push(`CTA: ${input.ctaText.trim()}`);
  return lines.join('\n');
}

/* ── Helpers ────────────────────────────────────────────────── */

function toUploadedAsset(a: FlowAsset, dataUrl: string | undefined): UploadedAsset {
  return {
    id: a.assetId,
    url: a.url,
    ...(dataUrl ? { dataUrl } : {}),
    fileName: a.fileName,
    role: a.role,
    hasAlpha: a.hasAlpha,
    originalDims: { width: a.originalDims.width, height: a.originalDims.height },
  };
}
