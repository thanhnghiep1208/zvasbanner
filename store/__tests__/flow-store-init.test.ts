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

describe('project đã lưu (T6.1)', () => {
  it('loadDoc: graph + exposed của project, Simple view, chưa có thay đổi; sửa → có thay đổi; markSaved → hết', async () => {
    const store = await freshStore();
    const s = () => store.getState();
    const t = getTemplate('social-post')!;
    s().loadDoc({ id: 'd1', title: 'Bài Tết', doc: { schemaVersion: 1, graph: t.graph, templateId: t.id, exposed: t.exposed } });
    expect(s()).toMatchObject({ docId: 'd1', docTitle: 'Bài Tết', templateId: 'social-post', view: 'simple' });
    expect(s().graph).toBe(s().savedGraph);
    s().setExposed(s().exposed.find((e) => e.id === 'headline')!, 'Mới');
    expect(s().graph).not.toBe(s().savedGraph);
    const g = s().graph;
    s().markSaved({ id: 'd1', title: 'Bài Tết', graph: g });
    expect(s().graph).toBe(s().savedGraph);
  });

  it('nạp template khi đang mở project → project mới chưa lưu, tên = tên template', async () => {
    const store = await freshStore();
    const s = () => store.getState();
    const t = getTemplate('social-post')!;
    s().loadDoc({ id: 'd1', title: 'Bài Tết', doc: { schemaVersion: 1, graph: t.graph } });
    expect(s().view).toBe('canvas'); // doc không có exposed
    s().loadTemplate(getTemplate('event-brand')!);
    expect(s()).toMatchObject({ docId: null, savedGraph: null, docTitle: 'Sự kiện theo thương hiệu' });
  });
});
