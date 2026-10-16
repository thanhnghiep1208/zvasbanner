import { describe, expect, it } from 'vitest';
import {
  FLOW_DOC_LIMITS, normalizeDocTitle, parseStoredFlowDoc, serializeFlowDoc, stripRuntimeAssets,
} from '../persistence';
import type { NodeParamsMap } from '../schema';
import { getTemplate, instantiateTemplate, setExposedValue } from '../template';

function savedDoc() {
  const p = instantiateTemplate(getTemplate('sale-multi-ratio')!);
  const asset: NodeParamsMap['product-asset'] = {
    assetId: 'a1', url: 'blob:http://localhost/x', fileName: 'sp.png', role: 'image', hasAlpha: true,
    originalDims: { width: 800, height: 600 },
  };
  const graph = setExposedValue(p.graph, p.exposed[0]!, asset);
  return { graph, doc: serializeFlowDoc(graph, undefined, { templateId: p.templateId, exposed: p.exposed }) };
}

describe('stripRuntimeAssets (Q7B)', () => {
  it('bỏ url node ảnh, giữ metadata; node khác giữ nguyên object', () => {
    const { graph } = savedDoc();
    const out = stripRuntimeAssets(graph);
    const p = out.nodes.find((n) => n.id === 'n-product-0')!.params as NodeParamsMap['product-asset'];
    expect(p).toMatchObject({ url: '', assetId: 'a1', fileName: 'sp.png', hasAlpha: true, originalDims: { width: 800, height: 600 } });
    expect(out.nodes.find((n) => n.id === 'n-brief')).toBe(graph.nodes.find((n) => n.id === 'n-brief'));
    // Không sửa graph gốc (đang hiển thị trên màn hình).
    expect((graph.nodes.find((n) => n.id === 'n-product-0')!.params as NodeParamsMap['product-asset']).url).toMatch(/^blob:/);
  });
});

describe('parseStoredFlowDoc', () => {
  it('doc hợp lệ qua JSON: giữ graph/templateId/exposed, url ảnh bị bỏ (kể cả data: gửi lén)', () => {
    const { doc } = savedDoc();
    const raw = JSON.parse(JSON.stringify(doc));
    raw.graph.nodes.find((n: { id: string }) => n.id === 'n-product-0').params.url = 'data:image/png;base64,AAAA';
    const out = parseStoredFlowDoc(raw);
    expect(out.templateId).toBe('sale-multi-ratio');
    expect(out.exposed).toEqual(doc.exposed);
    expect(out.graph.nodes).toHaveLength(doc.graph.nodes.length);
    expect((out.graph.nodes.find((n) => n.id === 'n-product-0')!.params as { url: string }).url).toBe('');
  });

  const bad = (mutate: (d: ReturnType<typeof savedDoc>['doc'] & Record<string, unknown>) => void) => {
    const d = JSON.parse(JSON.stringify(savedDoc().doc));
    mutate(d);
    return () => parseStoredFlowDoc(d);
  };

  it.each([
    ['không phải doc', () => parseStoredFlowDoc(null), /không hợp lệ/],
    ['schema mới hơn app', bad((d) => { d.schemaVersion = 99; }), /mới hơn/],
    ['node type lạ', bad((d) => { d.graph.nodes[0]!.type = 'hack' as never; }), /Node không hợp lệ/],
    ['thiếu position', bad((d) => { delete (d.graph.nodes[0] as { position?: unknown }).position; }), /Node không hợp lệ/],
    ['trùng id node', bad((d) => { d.graph.nodes[1]!.id = d.graph.nodes[0]!.id; }), /Trùng id/],
    ['dây trỏ node không có', bad((d) => { d.graph.edges[0]!.source = 'n-x'; }), /Dây nối/],
    ['quá nhiều node', bad((d) => {
      d.graph.nodes = Array.from({ length: FLOW_DOC_LIMITS.maxNodes + 1 }, (_, i) => ({ ...d.graph.nodes[0]!, id: `n${i}` }));
      d.graph.edges = [];
    }), /quá/],
    ['viewport sai', bad((d) => { d.viewport = { x: 1 } as never; }), /Viewport/],
  ])('%s → lỗi', (_n, fn, msg) => {
    expect(fn).toThrow(msg);
  });
});

describe('normalizeDocTitle', () => {
  it('cắt khoảng trắng, gộp space, giới hạn độ dài, rỗng → mặc định', () => {
    expect(normalizeDocTitle('  Sale   11.11 ')).toBe('Sale 11.11');
    expect(normalizeDocTitle('')).toBe('Banner chưa đặt tên');
    expect(normalizeDocTitle(42)).toBe('Banner chưa đặt tên');
    expect(normalizeDocTitle('x'.repeat(500))).toHaveLength(FLOW_DOC_LIMITS.maxTitleLength);
  });
});
