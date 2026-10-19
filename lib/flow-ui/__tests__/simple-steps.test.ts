import { describe, expect, it } from 'vitest';
import { getTemplate, instantiateTemplate, setExposedValue } from '@/lib/flow/template';
import type { FlowNode, NodeParamsMap } from '@/lib/flow/schema';
import { BRIEF_STEP, isMissing, missingCount, orderSteps, stepSummary } from '../simple-steps';

const sale = () => instantiateTemplate(getTemplate('sale-multi-ratio')!);
const uploaded: NodeParamsMap['product-asset'] = {
  assetId: 'a1', url: 'blob:x', fileName: 'sp.png', role: 'image', hasAlpha: true, originalDims: { width: 800, height: 800 },
};

describe('Simple view chia bước', () => {
  it('thứ tự: ảnh, chữ trước; Brief, phong cách, kích thước sau; nhóm lạ sau "Nội dung"', () => {
    expect(orderSteps(['Kích thước', BRIEF_STEP, 'Phong cách', 'Nội dung', 'Hình ảnh', 'Khác']))
      .toEqual(['Hình ảnh', 'Nội dung', 'Khác', BRIEF_STEP, 'Phong cách', 'Kích thước']);
  });

  it('thiếu mục bắt buộc: ảnh chưa tải, chữ rỗng; điền rồi thì hết', () => {
    const t = sale();
    const img = t.exposed.find((e) => e.control === 'asset')!;
    const headline = t.exposed.find((e) => e.control === 'text' && e.required)!;
    expect(isMissing(t.graph, img)).toBe(true);
    expect(isMissing(t.graph, headline)).toBe(false); // template có sẵn chữ
    const filled = setExposedValue(setExposedValue(t.graph, img, uploaded), headline, '  ');
    expect(isMissing(filled, img)).toBe(false);
    expect(isMissing(filled, headline)).toBe(true);
    expect(missingCount(filled, [img, headline])).toBe(1);
  });

  it('tóm tắt khi gập: ảnh, chữ, kích thước, brief', () => {
    const t = sale();
    const by = (g: string) => t.exposed.filter((e) => e.group === g);
    expect(stepSummary(t.graph, 'Hình ảnh', by('Hình ảnh'))).toBe('Chưa có ảnh');
    expect(stepSummary(t.graph, 'Nội dung', by('Nội dung').filter((e) => e.nodeId !== 'n-brief'))).toBe('GIẢM ĐẾN 50% · Chỉ 3 ngày cuối tuần');
    expect(stepSummary(t.graph, 'Kích thước', by('Kích thước'))).toBe('4 kích thước');
    expect(stepSummary(t.graph, BRIEF_STEP, [], 'n-brief')).toBe('Giúp AI chọn nền và gợi ý chữ');
    const graph = { ...t.graph, nodes: t.graph.nodes.map((n) => (n.id === 'n-brief'
      ? { ...n, params: { ...(n as FlowNode<'brief'>).params, campaign: { audience: 'Nữ 25–35', message: 'Da sáng sau 7 ngày', offer: '', tone: 'premium' } } }
      : n)) as FlowNode[] };
    expect(stepSummary(graph, BRIEF_STEP, [], 'n-brief')).toBe('Da sáng sau 7 ngày · Nữ 25–35 · Sang trọng, cao cấp');
  });
});
