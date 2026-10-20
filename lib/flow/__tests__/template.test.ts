import { describe, expect, it } from 'vitest';
import { decompileJob } from '../decompiler';
import { migrateFlowDoc, serializeFlowDoc } from '../persistence';
import {
  getExposedValue, instantiateTemplate, resolveExposed, setExposedValue, validateTemplate,
  type ExposedParam, type FlowTemplate,
} from '../template';
import { flatMinimal } from './fixtures';

const INTENTS = [
  { value: 'flash-sale', label: 'Flash sale' }, { value: 'product-launch', label: 'Ra mắt sản phẩm' },
  { value: 'brand-awareness', label: 'Nhận thức thương hiệu' }, { value: 'event', label: 'Sự kiện' },
];

/** Template mẫu đủ các loại control (T5.3 sẽ có template thật). */
function sample(): FlowTemplate {
  const exposed: ExposedParam[] = [
    { id: 'product', nodeId: 'n-product-0', path: [], label: 'Ảnh sản phẩm', control: 'asset', required: true, group: 'Hình ảnh' },
    { id: 'brief', nodeId: 'n-brief', path: ['prompt'], label: 'Mô tả banner', control: 'textarea', group: 'Nội dung' },
    { id: 'intents', nodeId: 'n-brief', path: ['marketingBrief', 'campaignIntents'], label: 'Mục tiêu', control: 'chips', options: INTENTS },
    { id: 'headline', nodeId: 'n-text-headline', path: ['content'], label: 'Tiêu đề chính', control: 'text' },
    { id: 'headline-color', nodeId: 'n-text-headline', path: ['style', 'fill', 'color'], label: 'Màu tiêu đề', control: 'color' },
    { id: 'size', nodeId: 'n-ratio', path: ['ratios'], label: 'Kích thước', control: 'ratios' },
    { id: 'preserve', nodeId: 'n-generate-flat', path: ['strictPreserveMode'], label: 'Giữ nguyên chủ thể', control: 'checkbox' },
  ];
  return { id: 'sample', name: 'Mẫu', description: 'Template mẫu cho test', graph: decompileJob(flatMinimal), exposed };
}

describe('validateTemplate', () => {
  it('template mẫu hợp lệ (ảnh chưa upload vẫn được)', () => {
    expect(validateTemplate(sample())).toEqual([]);
  });

  it.each([
    ['trùng id', (t: FlowTemplate) => { t.exposed.push({ ...t.exposed[1]! }); }, 'exposed-duplicate-id'],
    ['node không tồn tại', (t: FlowTemplate) => { t.exposed[1]!.nodeId = 'n-x'; }, 'exposed-node-missing'],
    ['path không tồn tại', (t: FlowTemplate) => { t.exposed[1]!.path = ['khong-co']; }, 'exposed-path-missing'],
    ['control sai kiểu', (t: FlowTemplate) => { t.exposed[1]!.control = 'number'; }, 'exposed-control-mismatch'],
    ['asset phải là path rỗng', (t: FlowTemplate) => { t.exposed[0]!.path = ['assetId']; }, 'exposed-control-mismatch'],
    ['giá trị ngoài options', (t: FlowTemplate) => { t.exposed[2]!.options = INTENTS.slice(2); }, 'exposed-option-invalid'],
    ['graph lỗi validate', (t: FlowTemplate) => { t.graph.edges = t.graph.edges.filter((e) => e.source !== 'n-brief'); }, 'graph-invalid'],
  ])('%s', (_name, mutate, code) => {
    const t = sample();
    mutate(t);
    expect(validateTemplate(t).map((i) => i.code)).toContain(code);
  });
});

describe('get/set theo path', () => {
  const t = sample();
  const byId = (id: string) => t.exposed.find((e) => e.id === id)!;

  it('đọc giá trị lồng nhau', () => {
    expect(getExposedValue(t.graph, byId('headline-color'))).toBe('#111111');
    expect(getExposedValue(t.graph, byId('intents'))).toEqual(['product-launch']);
  });

  it('ghi lồng nhau: không sửa graph cũ, giữ field anh em, node khác giữ nguyên object', () => {
    const g2 = setExposedValue(t.graph, byId('headline-color'), '#FF0000');
    const before = t.graph.nodes.find((n) => n.id === 'n-text-headline')!;
    const after = g2.nodes.find((n) => n.id === 'n-text-headline')!;
    expect(getExposedValue(g2, byId('headline-color'))).toBe('#FF0000');
    expect(getExposedValue(t.graph, byId('headline-color'))).toBe('#111111');
    expect((after.params as { style: { fontSizePx: number } }).style.fontSizePx)
      .toBe((before.params as { style: { fontSizePx: number } }).style.fontSizePx);
    expect(g2.nodes.find((n) => n.id === 'n-brief')).toBe(t.graph.nodes.find((n) => n.id === 'n-brief'));
  });

  it("control 'asset' (path []) thay cả params", () => {
    const asset = { assetId: 'a1', url: 'blob:x', fileName: 'sp.png', role: 'image', hasAlpha: true, originalDims: { width: 10, height: 10 } };
    expect(getExposedValue(setExposedValue(t.graph, byId('product'), asset), byId('product'))).toEqual(asset);
  });

  it('resolveExposed bỏ field của node đã xoá (user xoá ở Canvas view)', () => {
    const g = { ...t.graph, nodes: t.graph.nodes.filter((n) => n.id !== 'n-text-headline') };
    expect(resolveExposed(g, t.exposed).map((e) => e.id)).not.toContain('headline');
  });
});

describe('instantiateTemplate + persistence', () => {
  it('bản sao độc lập: sửa project không đổi template', () => {
    const t = sample();
    const p = instantiateTemplate(t);
    (p.graph.nodes[0]!.params as Record<string, unknown>).x = 1;
    p.exposed[0]!.label = 'đổi';
    expect((t.graph.nodes[0]!.params as Record<string, unknown>).x).toBeUndefined();
    expect(t.exposed[0]!.label).toBe('Ảnh sản phẩm');
    expect(p.templateId).toBe('sample');
  });

  it('StoredFlowDoc giữ templateId + exposed qua JSON; doc cũ không có vẫn đọc được', () => {
    const t = sample();
    const doc = serializeFlowDoc(t.graph, undefined, { templateId: t.id, exposed: t.exposed });
    expect(migrateFlowDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    const plain = serializeFlowDoc(t.graph);
    expect(plain).not.toHaveProperty('exposed');
    expect(migrateFlowDoc(JSON.parse(JSON.stringify(plain)))).toEqual(plain);
  });
});
