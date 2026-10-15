import { describe, expect, it } from 'vitest';
import { buildBackgroundPrompt, lightDirectionLabel } from '../background/prompt';
import { parseBackgroundRequestShape, toBackgroundRequests, type BackgroundRequest } from '../background/request';
import { planLayoutForJob } from '../layout/engine';
import { composedFull, composedMinimal } from './fixtures';

const plan = (job: typeof composedFull) => {
  const r = planLayoutForJob(job);
  if (!r.ok) throw new Error(r.message);
  return r.plan;
};

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const draft = (job = composedMinimal) => {
  const r = toBackgroundRequests(job, plan(job), { dataUrls: { 'ref-1': PNG, 'ref-bg': PNG } });
  if (!r.ok) throw new Error(r.message);
  return r.drafts[0]!.request;
};

describe('lightDirectionLabel', () => {
  it.each([[0, 'top'], [45, 'top-right'], [90, 'right'], [180, 'bottom'], [315, 'top-left'], [-45, 'top-left'], [350, 'top']])(
    '%i° → %s', (deg, label) => expect(lightDirectionLabel(deg)).toBe(label),
  );
});

describe('buildBackgroundPrompt (SPEC 5.3)', () => {
  it('đủ phần: kích thước, vùng trống theo guide, hướng sáng, cấm chữ, brief', () => {
    const p = buildBackgroundPrompt(draft());
    expect(p).toContain('exactly 1075×645px');
    expect(p).toMatch(/product zone: left \d+%, top \d+%/);
    expect(p).toMatch(/text zone: left \d+%/);
    expect(p).toContain('Single key light from the top-left (315°)');
    expect(p).toContain('ABSOLUTELY NO text');
    expect(p).toContain('Nền bếp sáng, tông gỗ ấm');
    expect(p).toContain('Do NOT draw any product');
  });

  it('không đưa focal subject (tránh model tự vẽ sản phẩm), giữ campaign intent', () => {
    const p = buildBackgroundPrompt(draft());
    expect(p).not.toContain('Product must be the dominant subject');
    expect(p).toContain('Campaign intent');
  });

  it('headline AI: cho phép đúng nội dung trong đúng vùng, cấm chữ chỗ khác', () => {
    const p = buildBackgroundPrompt(draft(composedFull));
    expect(p).toContain('"Tết Sum Vầy"');
    expect(p).toContain('ONLY inside the headline zone');
    expect(p).toContain('No other text');
    // Vùng headline AI không bị liệt kê là vùng phải để trống.
    const reserved = p.split('=== LIGHTING ===')[0]!;
    expect(reserved.match(/text zone/g)?.length).toBe(2); // subheadline + CTA
  });

  it('brand màu + ảnh tham chiếu style/background', () => {
    const p = buildBackgroundPrompt(draft(composedFull));
    expect(p).toContain('#C8102E, #FFD700');
    expect(p).toContain('STYLE REFERENCE');
    expect(p).toContain('BACKGROUND image');
  });
});

describe('toBackgroundRequests', () => {
  it('1 request / ratio, guide đúng ratio, không có ảnh sản phẩm', () => {
    const r = toBackgroundRequests(composedFull, plan(composedFull), {
      dataUrls: { 'asset-hop-qua': 'data:image/png;base64,PRODUCT', 'ref-1': PNG, 'ref-bg': PNG },
    });
    if (!r.ok) throw new Error();
    expect(r.drafts.map((d) => d.ratioId)).toEqual(composedFull.ratios.map((x) => x.id));
    expect(r.missingAssetIds).toEqual([]);
    expect(JSON.stringify(r.drafts)).not.toContain('PRODUCT');
  });
  it('flat → lỗi', () => {
    expect(toBackgroundRequests({ ...composedMinimal, renderMode: 'flat' }, plan(composedMinimal), { dataUrls: {} }).ok).toBe(false);
  });
});

describe('parseBackgroundRequestShape', () => {
  const valid = (): BackgroundRequest => ({ ...draft(composedFull), guideImage: PNG });
  it('body hợp lệ', () => expect(parseBackgroundRequestShape(JSON.parse(JSON.stringify(valid())))).not.toBeNull());
  it.each([
    ['guideImage không phải data URL ảnh', { guideImage: 'https://x.test/a.png' }],
    ['model lạ', { model: 'gpt-image' }],
    ['kích thước 0', { canvasConfig: { width: 0, height: 10, platform: 'x', name: 'x' } }],
    ['reference role product', { references: [{ role: 'image', fileName: 'a', dataUrl: PNG }] }],
    ['campaign intent lạ', { marketingBrief: { campaignIntents: ['hack'], focalSubjects: [] } }],
    ['guide kind lạ', { guide: [{ elementId: 'a', kind: 'pixels', x: 0, y: 0, w: 1, h: 1 }] }],
  ])('từ chối: %s', (_name, patch) => {
    expect(parseBackgroundRequestShape({ ...valid(), ...patch })).toBeNull();
  });
});
