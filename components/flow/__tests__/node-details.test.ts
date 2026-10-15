import { describe, expect, it } from 'vitest';
import { decompileJob } from '@/lib/flow/decompiler';
import { composedFull } from '@/lib/flow/__tests__/fixtures';
import type { FlowNode } from '@/lib/flow/schema';
import { nodeDetails } from '../nodes/node-details';

const g = decompileJob(composedFull);
const node = (id: string) => g.nodes.find((n) => n.id === id)! as FlowNode;
const labels = (id: string) => nodeDetails(node(id))!.chips.map((c) => c.label);

describe('nodeDetails – chi tiết trên node card', () => {
  it('text: nội dung đầy đủ + font, cỡ, màu, căn, viền/bóng/nền nút, AI vẽ', () => {
    const d = nodeDetails(node('n-text-headline'))!;
    expect(d.text).toBe('Tết Sum Vầy');
    expect(labels('n-text-headline')).toEqual(expect.arrayContaining([
      'AI vẽ chữ', 'Inter 700', '88px (tối thiểu 32)', '#FFD700', 'Căn giữa', 'Viền 3px', 'Bóng chữ',
    ]));
    expect(d.chips.find((c) => c.label === '#FFD700')!.swatch).toBe('#FFD700');
    expect(labels('n-text-cta')).toContain('Nền nút');
  });

  it('text dài không bị cắt', () => {
    const long = 'Giảm giá cực sốc cho toàn bộ sản phẩm gia dụng trong tuần lễ vàng tháng mười một';
    const n = { ...node('n-text-sub'), params: { ...node('n-text-sub').params, content: long } } as FlowNode;
    expect(nodeDetails(n)!.text).toBe(long);
  });

  it('brief: prompt đầy đủ + mục tiêu/chủ thể đã chọn (bỏ emoji)', () => {
    expect(nodeDetails(node('n-brief'))!.text).toBe('Campaign Tết, đỏ vàng, sang trọng');
    expect(labels('n-brief')).toEqual(['Sự kiện / Ngày lễ', 'Sản phẩm', 'Text / Thông điệp']);
  });

  it('style: phong cách, mood, bảng màu, kiểu chữ', () => {
    expect(labels('n-style')).toEqual(['Sang trọng', 'Lễ hội', 'Tông ấm', 'Hiện đại']);
  });

  it('brand kit: màu (có ô màu) + font', () => {
    const d = nodeDetails(node('n-brand'))!;
    expect(d.chips.map((c) => [c.label, c.swatch])).toEqual([['#C8102E', '#C8102E'], ['#FFD700', '#FFD700'], ['Font serif', undefined]]);
  });

  it('node khác: không có chi tiết', () => {
    expect(nodeDetails(node('n-generate'))).toBeNull();
  });
});
