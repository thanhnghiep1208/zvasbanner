import { describe, expect, it } from 'vitest';
import { decompileJob } from '@/lib/flow/decompiler';
import { NODE_DEFINITIONS } from '@/lib/flow/node-definitions';
import type { FlowNode, NodeType } from '@/lib/flow/schema';
import { composedFull, flatLegacy } from '@/lib/flow/__tests__/fixtures';
import { selectRFNodes } from '@/store/flow-store';
import { summarizeNode, truncate } from '../node-summary';

const node = <T extends NodeType>(type: T, params = NODE_DEFINITIONS[type].defaultParams): FlowNode =>
  ({ id: 'n', type, params, position: { x: 0, y: 0 } }) as FlowNode;

describe('summarizeNode', () => {
  it('mọi node type đều có summarizer, không throw với default params', () => {
    for (const type of Object.keys(NODE_DEFINITIONS) as NodeType[]) {
      expect(() => summarizeNode(node(type))).not.toThrow();
    }
  });

  it('ratio: 1 kích thước → tên + cỡ; nhiều → số lượng (card liệt kê đủ)', () => {
    expect(summarizeNode(decompileJob(composedFull).nodes.find((n) => n.type === 'ratio')!)).toBe('3 kích thước');
    expect(summarizeNode(decompileJob(flatLegacy).nodes.find((n) => n.type === 'ratio')!)).toMatch(/^.+ \d+×\d+$/);
  });

  it('generate: nhãn model giống form', () => {
    const g = decompileJob(flatLegacy);
    expect(summarizeNode(g.nodes.find((n) => n.type === 'generate-flat')!)).toBe('Nano Banana 2');
  });

  it('style: nhãn tiếng Việt từ lib/style-options', () => {
    const g = decompileJob(flatLegacy);
    expect(summarizeNode(g.nodes.find((n) => n.type === 'style')!)).toBe('Doanh nghiệp · Chuyên nghiệp');
  });

  it('text layer / brief: header chỉ role (nội dung đầy đủ nằm trong card)', () => {
    const g = decompileJob(flatLegacy);
    expect(summarizeNode(g.nodes.find((n) => n.id === 'n-text-cta')!)).toBe('CTA');
    expect(summarizeNode(g.nodes.find((n) => n.id === 'n-brief')!)).toBeNull();
  });

  it('truncate gộp khoảng trắng và cắt bằng …', () => {
    expect(truncate('a  b\nc', 10)).toBe('a b c');
    expect(truncate('x'.repeat(50), 10)).toBe(`${'x'.repeat(9)}…`);
  });
});

describe('selectRFNodes', () => {
  it('gắn ariaLabel = nhãn node + tóm tắt, và run info vào data', () => {
    const g = decompileJob(flatLegacy);
    const rf = selectRFNodes(g, {}, { 'n-generate-flat': { state: 'error', message: 'Hết quota' } });
    const gen = rf.find((n) => n.id === 'n-generate-flat')!;
    expect(gen.ariaLabel).toBe('Tạo banner (flat): Nano Banana 2');
    expect(gen.data.run).toEqual({ state: 'error', message: 'Hết quota' });
    expect(rf.find((n) => n.id === 'n-brief')!.data).not.toHaveProperty('run');
  });
});
