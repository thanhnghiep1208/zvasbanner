import { describe, expect, it } from 'vitest';
import { buildBackgroundPrompt } from '../background/prompt';
import { toBackgroundRequests } from '../background/request';
import { sceneWants } from '../background/scene-wants';
import { planLayoutForJob } from '../layout/engine';
import { composedFull, composedMinimal } from './fixtures';

const draft = (prompt: string, references = composedMinimal.references) => {
  const job = { ...composedMinimal, references, brief: { ...composedMinimal.brief, prompt } };
  const plan = planLayoutForJob(job);
  if (!plan.ok) throw new Error(plan.message);
  const r = toBackgroundRequests(job, plan.plan, { dataUrls: { 'ref-1': 'data:image/png;base64,R', 'ref-bg': 'data:image/png;base64,B' } });
  if (!r.ok) throw new Error(r.message);
  return r.drafts[0]!.request;
};

describe('bục / hoa lá chỉ khi brief nhắc tới', () => {
  it('nhận từ khoá tiếng Việt có dấu và tiếng Anh, không nhầm từ gần giống', () => {
    expect(sceneWants('Sản phẩm đặt trên bục đá cẩm thạch')).toEqual({ pedestal: true, foliage: false });
    expect(sceneWants('marble podium, tropical palm leaves')).toEqual({ pedestal: true, foliage: true });
    expect(sceneWants('Không gian Tết, cành mai vàng')).toMatchObject({ foliage: true });
    expect(sceneWants('Nền đỏ cam rực rỡ, ánh sáng sân khấu, confetti')).toEqual({ pedestal: false, foliage: false });
    // "hoà", "hoá", "lạ", "standing" không phải hoa/lá/stand.
    expect(sceneWants('hài hoà, tối ưu hoá, cảm giác lạ, standing light')).toEqual({ pedestal: false, foliage: false });
  });

  it('brief không nhắc: prompt cấm bục + hoa lá, không gợi ý "If you show a pedestal", không liệt kê "plants" (cả 2 kiểu)', () => {
    for (const guideStyle of ['natural', 'hatched'] as const) {
      const p = buildBackgroundPrompt({ ...draft('Nền bếp sáng, tông gỗ ấm', []), guideStyle });
      expect(p).toContain('No pedestal, podium, plinth, stand or display box');
      expect(p).toContain('No plants, leaves, palm fronds, branches or flowers');
      expect(p).not.toMatch(/If you (show|add) a pedestal/);
      expect(p).not.toContain('(plants, furniture');
    }
  });

  it('brief nhắc bục / hoa lá: cho phép và hướng dẫn đặt bục đúng chỗ', () => {
    const p = buildBackgroundPrompt({ ...draft('Bục đá trắng, vài nhành hoa khô', []), guideStyle: 'natural' });
    expect(p).toMatch(/If you show a pedestal, podium/);
    expect(p).not.toContain('No pedestal');
    expect(p).not.toContain('No plants');
  });

  it('có banner mẫu / ảnh nền: không cấm (ảnh mẫu quyết định)', () => {
    expect(composedFull.references.length).toBeGreaterThan(0);
    const p = buildBackgroundPrompt({ ...draft('Nền bếp sáng', composedFull.references), guideStyle: 'natural' });
    expect(p).not.toContain('No pedestal');
    expect(p).not.toContain('No plants');
  });
});
