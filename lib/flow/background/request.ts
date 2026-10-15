/**
 * Request sinh nền cho composed mode (T4.2, SPEC 5.3) – body của POST /api/flow/generate-background.
 *
 * Bất biến asset fidelity (SPEC 2.1): request KHÔNG có pixel sản phẩm. Vị trí sản phẩm/chữ chỉ đi qua
 * `guide` (toạ độ) + `guideImage` (khối xám do client vẽ từ guide). Ảnh gửi model chỉ là ảnh tham chiếu
 * (style-reference / background) và guide image.
 */
import type { BrandKit, CanvasConfig, MarketingBrief } from '@/lib/types';
import type { CompiledJob } from '../compiled-job';
import type { LayoutPlan, GuideRect } from '../layout/types';
import type { LegacyRuntime } from '../legacy/from-legacy-config';
import type { FlowStyle, ModelId, ReferenceAssetRole } from '../schema';

export type GuideStyle = 'hatched' | 'natural';

export interface BackgroundReference {
  role: ReferenceAssetRole;
  fileName: string;
  dataUrl: string;
}

export interface BackgroundRequest {
  canvasConfig: CanvasConfig;
  model: ModelId;
  prompt: string;
  marketingBrief: MarketingBrief;
  style?: FlowStyle;
  brandKit?: BrandKit;
  /** Hướng sáng (độ, 0 = trên, theo chiều kim đồng hồ; 315 = trên-trái). Compose dùng lại cho bóng. */
  lightDirectionDeg: number;
  strictNoText: boolean;
  /** Vùng phải để trống (chuẩn hoá 0–1). */
  guide: GuideRect[];
  /** Headline renderSource 'ai': được phép vẽ chữ này, CHỈ trong vùng `elementId` của guide. */
  aiHeadline?: { elementId: string; content: string };
  /**
   * Cách truyền vùng trống cho model (T4.2b, Q11):
   * - 'hatched' (mặc định, SPEC 3 #1): ảnh guide khung gạch chéo + toạ độ % trong prompt;
   * - 'natural': không ảnh guide, bố cục mô tả bằng lời, không con số (chống chế độ "mockup").
   */
  guideStyle?: GuideStyle;
  /** PNG data URL của layout guide (client vẽ từ `guide`); không có khi guideStyle = 'natural'. */
  guideImage?: string;
  references: BackgroundReference[];
}

/** Request chưa có guideImage – UI vẽ guide rồi gắn vào. */
export type BackgroundRequestDraft = Omit<BackgroundRequest, 'guideImage' | 'guideStyle'>;

export type BackgroundDraftResult =
  | { ok: true; drafts: { ratioId: string; request: BackgroundRequestDraft }[]; missingAssetIds: string[] }
  | { ok: false; message: string };

/** CompiledJob composed + LayoutPlan → 1 draft / ratio. */
export function toBackgroundRequests(job: CompiledJob, plan: LayoutPlan, runtime: LegacyRuntime): BackgroundDraftResult {
  if (job.renderMode !== 'composed' || !job.composed) {
    return { ok: false, message: 'Chỉ job composed mới sinh nền riêng.' };
  }
  const missingAssetIds = job.references.filter((r) => !runtime.dataUrls[r.assetId]).map((r) => r.assetId);
  const references: BackgroundReference[] = job.references
    .filter((r) => runtime.dataUrls[r.assetId])
    .map((r) => ({ role: r.role, fileName: r.fileName, dataUrl: runtime.dataUrls[r.assetId]! }));
  const ai = job.textLayers.find((l) => l.role === 'headline' && l.renderSource === 'ai');

  const drafts = job.ratios.map(({ id, ...canvasConfig }) => ({
    ratioId: id,
    request: {
      canvasConfig,
      model: job.model,
      prompt: job.brief.prompt,
      marketingBrief: job.brief.marketingBrief,
      ...(job.style ? { style: job.style } : {}),
      ...(job.brandKit ? { brandKit: job.brandKit } : {}),
      lightDirectionDeg: job.composed!.lightDirectionDeg,
      strictNoText: job.composed!.strictNoText,
      guide: plan.guide[id] ?? [],
      ...(ai && plan.guide[id]?.some((g) => g.elementId === ai.layerId)
        ? { aiHeadline: { elementId: ai.layerId, content: ai.content } }
        : {}),
      references,
    } satisfies BackgroundRequestDraft,
  }));
  return { ok: true, drafts, missingAssetIds };
}

/* ── Parse body (server) ────────────────────────────────────── */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/**
 * Kiểm tra cấu trúc body. Kiểu chi tiết của style/brandKit/marketingBrief do server validate lại bằng
 * parser của form (lib/validate-generation.ts) ở route.
 */
export function parseBackgroundRequestShape(v: unknown): BackgroundRequest | null {
  if (!isRecord(v)) return null;
  const { canvasConfig, model, prompt, marketingBrief, lightDirectionDeg, strictNoText, guide, guideImage, guideStyle, references, aiHeadline } = v;
  if (!isRecord(canvasConfig) || !isNum(canvasConfig.width) || !isNum(canvasConfig.height)
    || !isStr(canvasConfig.platform) || !isStr(canvasConfig.name)) return null;
  if (canvasConfig.width <= 0 || canvasConfig.height <= 0) return null;
  if (model !== 'nano-banana-pro' && model !== 'nano-banana-2') return null;
  if (!isStr(prompt) || prompt.length > 4000) return null;
  if (!isRecord(marketingBrief)) return null;
  const INTENTS = ['flash-sale', 'product-launch', 'brand-awareness', 'event'];
  const FOCALS = ['product', 'person', 'text', 'scene'];
  const okList = (x: unknown, allowed: string[]) => Array.isArray(x) && x.every((i) => allowed.includes(i as string));
  if (!okList(marketingBrief.campaignIntents, INTENTS) || !okList(marketingBrief.focalSubjects, FOCALS)) return null;
  if (!isNum(lightDirectionDeg) || typeof strictNoText !== 'boolean') return null;
  if (guideStyle !== undefined && guideStyle !== 'hatched' && guideStyle !== 'natural') return null;
  if (guideStyle === 'natural' ? guideImage !== undefined : !isStr(guideImage) || !IMAGE_DATA_URL.test(guideImage)) return null;
  if (!Array.isArray(guide) || guide.length > 50) return null;
  for (const g of guide) {
    if (!isRecord(g) || !isStr(g.elementId) || !['product', 'logo', 'text'].includes(g.kind as string)) return null;
    if (![g.x, g.y, g.w, g.h].every(isNum)) return null;
  }
  if (!Array.isArray(references) || references.length > 10) return null;
  for (const r of references) {
    if (!isRecord(r) || (r.role !== 'style-reference' && r.role !== 'background')) return null;
    if (!isStr(r.fileName) || !isStr(r.dataUrl) || !IMAGE_DATA_URL.test(r.dataUrl)) return null;
  }
  if (aiHeadline !== undefined && (!isRecord(aiHeadline) || !isStr(aiHeadline.elementId) || !isStr(aiHeadline.content))) {
    return null;
  }
  return v as unknown as BackgroundRequest;
}
