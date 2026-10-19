import { describe, expect, it } from 'vitest';
import { buildBackgroundPrompt } from '../background/prompt';
import { parseBackgroundRequestShape, toBackgroundRequests } from '../background/request';
import { campaignLegacyLines, campaignPromptLines, hasCampaign, parseCampaign, type CampaignBrief } from '../brief';
import { buildCopyPrompt, canSuggestCopy, clip, COPY_LIMITS, parseCopyResponse } from '../copy-suggest';
import { planLayoutForJob } from '../layout/engine';
import { toLegacyConfig } from '../legacy/to-legacy-config';
import type { FlowGraph, NodeParamsMap } from '../schema';
import { getTemplate, instantiateTemplate } from '../template';
import { applyCopy, newTextLayerParams } from '../text-nodes';
import { validateGraph } from '../validate';
import { compileGraph } from '../compiler';
import { composedMinimal, flatLegacy } from './fixtures';

const plan = (job: typeof composedMinimal) => {
  const r = planLayoutForJob(job);
  if (!r.ok) throw new Error(r.message);
  return r.plan;
};

const campaign: CampaignBrief = {
  audience: 'Nữ 25–35, dân văn phòng', message: 'Da sáng mịn sau 7 ngày', offer: 'Giảm 30% + freeship', tone: 'premium',
};

describe('brief marketing (campaign)', () => {
  it('hasCampaign / parseCampaign: trống = không có; kiểm độ dài và tone', () => {
    expect(hasCampaign(undefined)).toBe(false);
    expect(hasCampaign({ audience: ' ', message: '', offer: '' })).toBe(false);
    expect(hasCampaign(campaign)).toBe(true);
    expect(parseCampaign(campaign)).toEqual(campaign);
    expect(parseCampaign({ ...campaign, tone: 'angry' })).toBeNull();
    expect(parseCampaign({ ...campaign, audience: 'x'.repeat(301) })).toBeNull();
    expect(parseCampaign({ audience: 1, message: '', offer: '' })).toBeNull();
  });

  it('prompt nền: có khối CAMPAIGN, dặn không vẽ thành chữ; không có campaign thì prompt như cũ', () => {
    const job = { ...composedMinimal, brief: { ...composedMinimal.brief, campaign } };
    const r = toBackgroundRequests(job, plan(job), { dataUrls: {} });
    expect(r.ok).toBe(true);
    const req = r.ok ? r.drafts[0]!.request : undefined;
    expect(req?.campaign).toEqual(campaign);
    const prompt = buildBackgroundPrompt({ ...req!, guideStyle: 'natural' });
    expect(prompt).toContain('never write any of it as text');
    expect(prompt).toContain('Target audience: Nữ 25–35, dân văn phòng');
    expect(prompt).toContain('Tone: premium, elegant and refined');
    expect(buildBackgroundPrompt({ ...req!, guideStyle: 'hatched' })).toContain('=== CAMPAIGN ===');

    const plain = toBackgroundRequests(composedMinimal, plan(composedMinimal), { dataUrls: {} });
    expect(plain.ok && 'campaign' in plain.drafts[0]!.request).toBe(false);
    expect(campaignPromptLines(undefined)).toEqual([]);
  });

  it('server kiểm campaign trong body', () => {
    const job = { ...composedMinimal, brief: { ...composedMinimal.brief, campaign } };
    const r = toBackgroundRequests(job, plan(job), { dataUrls: {} });
    const body = { ...(r.ok ? r.drafts[0]!.request : {}), guideStyle: 'natural' };
    expect(parseBackgroundRequestShape(body)).not.toBeNull();
    expect(parseBackgroundRequestShape({ ...body, campaign: { ...campaign, tone: 'x' } })).toBeNull();
  });

  it('flat: brief thành các dòng tiếng Việt trước mô tả nền trong userPrompt', () => {
    const job = { ...flatLegacy, brief: { ...flatLegacy.brief, campaign } };
    const res = toLegacyConfig(job, { dataUrls: {} });
    const prompt = res.ok ? res.requests[0]!.request.userPrompt : '';
    expect(prompt.startsWith('Đối tượng: Nữ 25–35, dân văn phòng\nThông điệp chính: Da sáng mịn sau 7 ngày\nƯu đãi: Giảm 30% + freeship\nTone: Sang trọng, cao cấp')).toBe(true);
    expect(campaignLegacyLines({ audience: '', message: '', offer: '' })).toEqual([]);
    const plain = toLegacyConfig(flatLegacy, { dataUrls: {} });
    expect(plain.ok && plain.requests[0]!.request.userPrompt.includes('Đối tượng:')).toBe(false);
  });
});

describe('gợi ý chữ từ brief', () => {
  it('cần thông điệp hoặc ưu đãi; prompt có đủ brief và giới hạn độ dài, cấm bịa số', () => {
    expect(canSuggestCopy({ audience: 'a', message: '', offer: '' })).toBe(false);
    expect(canSuggestCopy({ audience: '', message: '', offer: 'Giảm 10%' })).toBe(true);
    const p = buildCopyPrompt({ campaign, intents: ['flash-sale'], scene: 'bàn gỗ', brandName: 'zCloud' });
    for (const s of ['Thương hiệu: zCloud', 'Mục đích: Flash sale', 'Đối tượng: Nữ 25–35', 'Ưu đãi: Giảm 30%', 'Tone giọng: Sang trọng',
      `tối đa ${COPY_LIMITS.headline} ký tự`, 'KHÔNG bịa con số']) expect(p).toContain(s);
  });

  it('đọc JSON (cả khi bọc ```json), cắt theo giới hạn, bỏ trùng, tối đa 3', () => {
    const v = (h: string) => ({ headline: h, subheadline: 'Mô tả', cta: 'Mua ngay' });
    const text = '```json\n' + JSON.stringify({ variants: [v('Da sáng sau 7 ngày'), v('da sáng sau 7 ngày'), v('"Rạng rỡ mỗi ngày"'), v(''), v('A'), v('B')] }) + '\n```';
    const out = parseCopyResponse(text);
    expect(out.map((x) => x.headline)).toEqual(['Da sáng sau 7 ngày', 'Rạng rỡ mỗi ngày', 'A']);
    expect(parseCopyResponse('không phải json')).toEqual([]);
    expect(parseCopyResponse('{"variants": 3}')).toEqual([]);
    const long = clip('Một tiêu đề rất dài vượt quá giới hạn bốn mươi ký tự cho phép, phải cắt', 40);
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith(' ')).toBe(false);
    // Hết câu trước giới hạn → cắt ở cuối câu, không để câu cụt.
    expect(clip('Cải thiện da sáng đều màu sau 7 ngày với vitamin C thiên nhiên. Freeship áp dụng đến 20/11 cho mọi đơn.', 90))
      .toBe('Cải thiện da sáng đều màu sau 7 ngày với vitamin C thiên nhiên.');
    expect(clip('Serum vitamin C thiên nhiên giúp da sáng đều màu sau 7 ngày, kèm freeship cho nàng văn phòng bận rộn', 90))
      .toBe('Serum vitamin C thiên nhiên giúp da sáng đều màu sau 7 ngày');
  });

  it('applyCopy: điền vào Text cùng vai trò; thiếu CTA → thêm node Text CTA nối như Text khác, graph không lỗi', () => {
    const t = instantiateTemplate(getTemplate('product-hero')!); // có headline + sub, chưa có CTA
    const { graph, added } = applyCopy(t.graph, { headline: 'Da sáng sau 7 ngày', subheadline: 'Thành phần thiên nhiên', cta: 'Mua ngay' });
    expect(added).toEqual(['cta']);
    const text = (role: string) => graph.nodes.filter((n) => n.type === 'text-layer' && (n.params as NodeParamsMap['text-layer']).role === role);
    expect((text('headline')[0]!.params as NodeParamsMap['text-layer']).content).toBe('Da sáng sau 7 ngày');
    expect((text('subheadline')[0]!.params as NodeParamsMap['text-layer']).content).toBe('Thành phần thiên nhiên');
    const cta = text('cta')[0]!;
    expect(cta.params).toMatchObject({ content: 'Mua ngay', autoStyle: true, layerId: cta.id });
    const outs = (g: FlowGraph, id: string) => g.edges.filter((e) => e.source === id).map((e) => `${e.target}.${e.targetPort}`).sort();
    expect(outs(graph, cta.id)).toEqual(outs(graph, text('headline')[0]!.id));
    expect(validateGraph(graph).filter((i) => i.severity === 'error')).toEqual([]);
    const job = compileGraph(graph);
    expect(job.ok && job.job.textLayers.map((l) => l.role).sort()).toEqual(['cta', 'headline', 'subheadline']);
  });

  it('applyCopy: vai trò để trống không đụng; Text mới lấy font Brand kit', () => {
    const t = instantiateTemplate(getTemplate('product-hero')!);
    expect(applyCopy(t.graph, { headline: '', cta: '' }).graph).toBe(t.graph);
    const withBrand: FlowGraph = { ...t.graph, nodes: [...t.graph.nodes, { id: 'n-brand', type: 'brand-kit', position: { x: 0, y: 0 }, params: { colors: [], fontPreference: 'Montserrat' } }] };
    expect(newTextLayerParams(withBrand, 'x', 'cta').style.fontFamily).toBe('montserrat');
  });
});
