import { describe, expect, it } from 'vitest';
import { decompileJob } from '@/lib/flow/decompiler';
import { composedFull } from '@/lib/flow/__tests__/fixtures';
import type { FlowNode } from '@/lib/flow/schema';
import { MAX_CHIPS, nodeDetails } from '../nodes/node-details';

const g = decompileJob(composedFull);
const node = (id: string) => g.nodes.find((n) => n.id === id)! as FlowNode;
const labels = (id: string) => nodeDetails(node(id))!.chips.map((c) => c.label);

describe('nodeDetails – chi tiết trên node card', () => {
  it('text: nội dung + chỉ chip chính (AI vẽ chữ thay mọi style)', () => {
    const d = nodeDetails(node('n-text-headline'))!;
    expect(d.text).toBe('Tết Sum Vầy');
    expect(labels('n-text-headline')).toEqual(['AI vẽ chữ']);
  });

  it('text chỉnh tay: font + cỡ, màu (có ô màu); không liệt kê viền/bóng/nền nút', () => {
    const n = node('n-text-cta');
    const d = nodeDetails({ ...n, params: { ...n.params, autoStyle: false, renderSource: 'layer' } } as FlowNode)!;
    expect(d.chips).toHaveLength(2);
    expect(d.chips[1]!.swatch).toBe(d.chips[1]!.label);
    expect(d.chips.map((c) => c.label)).not.toContain('Nền nút');
  });

  it('text tự động: không có chip', () => {
    const n = node('n-text-cta');
    expect(nodeDetails({ ...n, params: { ...n.params, autoStyle: true, renderSource: 'layer' } } as FlowNode)!.chips).toEqual([]);
  });

  it('text dài không bị cắt', () => {
    const long = 'Giảm giá cực sốc cho toàn bộ sản phẩm gia dụng trong tuần lễ vàng tháng mười một';
    const n = { ...node('n-text-sub'), params: { ...node('n-text-sub').params, content: long } } as FlowNode;
    expect(nodeDetails(n)!.text).toBe(long);
  });

  it('brief: prompt + mục tiêu đã chọn (bỏ emoji), không có chủ thể chính', () => {
    expect(nodeDetails(node('n-brief'))!.text).toBe('Campaign Tết, đỏ vàng, sang trọng');
    expect(labels('n-brief')).toEqual(['Sự kiện / Ngày lễ']);
  });

  it(`brief: quá ${MAX_CHIPS} chip → gộp thành "+N"`, () => {
    const n = node('n-brief') as FlowNode<'brief'>;
    const many = { ...n, params: { ...n.params, marketingBrief: { ...n.params.marketingBrief,
      campaignIntents: ['product-launch', 'flash-sale', 'event', 'brand-awareness'] } } } as FlowNode;
    const chips = nodeDetails(many)!.chips.map((c) => c.label);
    expect(chips).toHaveLength(MAX_CHIPS);
    expect(chips.at(-1)).toBe('+2');
  });

  it('style: chỉ bảng màu (phong cách · mood đã ở header)', () => {
    expect(labels('n-style')).toEqual(['Tông ấm']);
  });

  it('brand kit: chỉ ô màu, không font', () => {
    const d = nodeDetails(node('n-brand'))!;
    expect(d.chips.map((c) => [c.label, c.swatch, c.swatchOnly])).toEqual([['#C8102E', '#C8102E', true], ['#FFD700', '#FFD700', true]]);
  });

  it('node khác: không có chi tiết', () => {
    expect(nodeDetails(node('n-generate'))).toBeNull();
  });
});
