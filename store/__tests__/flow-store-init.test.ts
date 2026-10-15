import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_TEMPLATES, getTemplate } from '@/lib/flow/template';

/** Module mới mỗi test: kiểm state đầu của store singleton (T5.4). */
async function freshStore() {
  vi.resetModules();
  return (await import('../flow-store')).useFlowStore;
}

describe('flow-store khởi tạo (T5.4)', () => {
  it('mở lên là template mặc định ở Simple view, không phải canvas trống', async () => {
    const s = (await freshStore()).getState();
    expect(s.graph.nodes.length).toBeGreaterThan(0);
    expect(s.templateId).toBe(DEFAULT_TEMPLATES[0]!.id);
    expect(s.exposed.length).toBeGreaterThan(0);
    expect(s.view).toBe('simple');
    // Bản sao: sửa store không đụng template gốc.
    expect(s.graph).not.toBe(DEFAULT_TEMPLATES[0]!.graph);
    expect(s.graph).toEqual(DEFAULT_TEMPLATES[0]!.graph);
  });

  it('templateBaseline: chưa sửa = graph; sửa field → khác; nạp template khác → baseline mới', async () => {
    const store = await freshStore();
    const s = () => store.getState();
    expect(s().graph).toBe(s().templateBaseline);
    s().setExposed(s().exposed.find((e) => e.id === 'headline')!, 'Mới');
    expect(s().graph).not.toBe(s().templateBaseline);
    s().loadTemplate(getTemplate('sale-multi-ratio')!);
    expect(s().templateId).toBe('sale-multi-ratio');
    expect(s().graph).toBe(s().templateBaseline);
    s().setGraph({ nodes: [], edges: [] });
    expect(s().templateBaseline).toBeNull();
  });
});
