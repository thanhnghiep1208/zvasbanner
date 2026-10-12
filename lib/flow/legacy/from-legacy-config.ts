/**
 * GenerationRequest (body form gửi POST /api/generate) → CompiledJob (renderMode 'flat').
 * Bảng mapping đầy đủ: ./README.md
 *
 * | GenerationRequest                     | CompiledJob                                   |
 * |---------------------------------------|-----------------------------------------------|
 * | canvasConfig                          | ratios[0] (preset id hoặc custom-<w>x<h>)   |
 * | assets[] image/logo/decoration        | products[]                                    |
 * | assets[] style-reference/background   | references[]                                  |
 * | assets[].dataUrl                      | runtime.dataUrls[assetId] (không vào job)     |
 * | brandKit                              | brandKit (bỏ khi rỗng)                        |
 * | userPrompt                            | brief.prompt + textLayers (tách Headline/…)   |
 * | styleControls − strictPreserveMode    | style                                         |
 * | styleControls.strictPreserveMode      | flat.strictPreserveMode                       |
 * | imageModel                            | model                                         |
 * | marketingBrief?                       | brief.marketingBrief (thiếu → mảng rỗng)      |
 * | layoutAdaptationFromBanner?           | runtime.layoutAdaptationFromBanner            |
 */
import type { BrandKit, CanvasConfig, GenerationRequest, UploadedAsset } from '@/lib/types';
import { configToPresetId, CUSTOM_PRESET_ID } from '@/lib/canvas-presets';
import type { CompiledJob } from '../compiled-job';
import { NODE_DEFINITIONS } from '../node-definitions';
import type {
  FlowAsset, NodeParamsMap, PixelAssetRole, RatioSpec, ReferenceAssetRole, TextRole,
} from '../schema';
import { FLOW_SCHEMA_VERSION } from '../schema';

/** Field text của form trong store/editor.ts – có khi gọi từ state editor (lossless). */
export interface LegacyFormText {
  userPrompt: string;
  headline: string;
  subheadline: string;
  ctaText: string;
}

/** Dữ liệu chỉ có lúc chạy, không lưu trong graph. toLegacyConfig cần lại để dựng request. */
export interface LegacyRuntime {
  dataUrls: Record<string, string>;
  layoutAdaptationFromBanner?: string;
}

export interface FromLegacyResult {
  job: CompiledJob;
  runtime: LegacyRuntime;
}

const PIXEL_ROLES: readonly PixelAssetRole[] = ['image', 'logo', 'decoration'];

export function fromLegacyConfig(
  request: GenerationRequest,
  options?: { form?: LegacyFormText },
): FromLegacyResult {
  const text = options?.form
    ? { prompt: options.form.userPrompt.trim(), headline: options.form.headline, subheadline: options.form.subheadline, cta: options.form.ctaText }
    : splitComposedPrompt(request.userPrompt);

  const products: FlowAsset<PixelAssetRole>[] = [];
  const references: FlowAsset<ReferenceAssetRole>[] = [];
  const dataUrls: Record<string, string> = {};
  for (const a of request.assets) {
    if (a.dataUrl !== undefined) dataUrls[a.id] = a.dataUrl;
    if (isPixelRole(a.role)) products.push(toFlowAsset(a, a.role));
    else references.push(toFlowAsset(a, a.role));
  }

  const { strictPreserveMode, ...style } = request.styleControls;
  const brandKit = isEmptyBrandKit(request.brandKit) ? undefined : request.brandKit;

  const job: CompiledJob = {
    schemaVersion: FLOW_SCHEMA_VERSION,
    renderMode: 'flat',
    ratios: [toRatioSpec(request.canvasConfig)],
    brief: {
      prompt: text.prompt,
      marketingBrief: request.marketingBrief ?? { campaignIntents: [], focalSubjects: [] },
    },
    style,
    ...(brandKit ? { brandKit } : {}),
    references,
    model: request.imageModel,
    products,
    textLayers: toTextLayers(text),
    flat: { strictPreserveMode },
    export: { ...NODE_DEFINITIONS.export.defaultParams },
  };

  return {
    job,
    runtime: {
      dataUrls,
      ...(request.layoutAdaptationFromBanner
        ? { layoutAdaptationFromBanner: request.layoutAdaptationFromBanner }
        : {}),
    },
  };
}

/* ── Text ───────────────────────────────────────────────────── */

/** Nhãn dòng do composeUserPrompt() (lib/client-generation.ts) thêm vào cuối prompt, đúng thứ tự. */
const TEXT_LABELS = [
  { label: 'Headline', key: 'headline' },
  { label: 'Subheadline', key: 'subheadline' },
  { label: 'CTA', key: 'cta' },
] as const;

type SplitText = { prompt: string; headline: string; subheadline: string; cta: string };

/**
 * Tách ngược composeUserPrompt(): các dòng `Headline: …`, `Subheadline: …`, `CTA: …`
 * ở cuối prompt, theo đúng thứ tự đó, mỗi nhãn tối đa 1 lần. Dòng ở giữa prompt giữ nguyên.
 */
export function splitComposedPrompt(userPrompt: string): SplitText {
  const lines = userPrompt.split('\n');
  const out: SplitText = { prompt: '', headline: '', subheadline: '', cta: '' };
  let nextLabel: number = TEXT_LABELS.length; // chỉ nhận nhãn đứng trước nhãn đã gặp (đọc từ cuối)

  while (lines.length > 0) {
    const line = lines[lines.length - 1]!;
    const idx = TEXT_LABELS.findIndex((t, i) => i < nextLabel && line.startsWith(`${t.label}: `));
    if (idx === -1) break;
    out[TEXT_LABELS[idx]!.key] = line.slice(TEXT_LABELS[idx]!.label.length + 2).trim();
    nextLabel = idx;
    lines.pop();
  }
  out.prompt = lines.join('\n').trim();
  return out;
}

function toTextLayers(text: SplitText): NodeParamsMap['text-layer'][] {
  const base = NODE_DEFINITIONS['text-layer'].defaultParams;
  const layers: NodeParamsMap['text-layer'][] = [];
  const add = (role: TextRole, content: string, priority: number) => {
    const c = content.trim();
    // Flat: Gemini vẽ mọi chữ, renderSource bị bỏ qua → để mặc định 'layer'.
    if (c) layers.push({ ...base, layerId: role, role, content: c, priority });
  };
  add('headline', text.headline, 1);
  add('subheadline', text.subheadline, 2);
  add('cta', text.cta, 3);
  return layers;
}

/* ── Helpers ────────────────────────────────────────────────── */

export function toRatioSpec(c: CanvasConfig): RatioSpec {
  const presetId = configToPresetId(c);
  const id = presetId === CUSTOM_PRESET_ID ? `custom-${c.width}x${c.height}` : presetId;
  return { id, width: c.width, height: c.height, platform: c.platform, name: c.name };
}

function isPixelRole(role: UploadedAsset['role']): role is PixelAssetRole {
  return (PIXEL_ROLES as readonly string[]).includes(role);
}

function toFlowAsset<R extends PixelAssetRole | ReferenceAssetRole>(a: UploadedAsset, role: R): FlowAsset<R> {
  return {
    assetId: a.id,
    url: a.url,
    fileName: a.fileName,
    role,
    hasAlpha: a.hasAlpha,
    originalDims: { width: a.originalDims.width, height: a.originalDims.height },
  };
}

function isEmptyBrandKit(b: BrandKit): boolean {
  return b.colors.length === 0 && !b.fontPreference && !b.logoPosition;
}
