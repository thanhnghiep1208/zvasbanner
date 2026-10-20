import { describe, expect, it } from 'vitest';
import { NODE_DEFINITIONS } from '@/lib/flow/node-definitions';
import type { NodeType } from '@/lib/flow/schema';
import { NEED, RECIPE } from '../guide/guide-content';

const TYPES = Object.keys(NODE_DEFINITIONS) as NodeType[];

describe('guide-content – khớp registry node', () => {
  it('mọi dây trỏ đúng port vào có thật, cùng kiểu với port ra', () => {
    for (const e of RECIPE.edges) {
      const inPort = NODE_DEFINITIONS[e.to].inputs.find((p) => p.id === e.port);
      expect(inPort, `${e.to}.${e.port}`).toBeDefined();
      expect(NODE_DEFINITIONS[e.from].outputs.map((o) => o.type)).toContain(inPort!.type);
      expect(e.required, `${e.from}→${e.to}`).toBe(inPort!.required);
    }
  });

  it('sơ đồ các bước có đủ mọi node, mỗi node 1 lần', () => {
    const staged = RECIPE.stages.flatMap((s) => s.nodes);
    expect(new Set(staged).size).toBe(staged.length);
    expect([...staged].sort()).toEqual([...TYPES].sort());
  });

  it('mọi node đều có dây; node "Bắt buộc" có đủ dây cho mọi port bắt buộc', () => {
    for (const t of TYPES) {
      expect(RECIPE.edges.some((e) => e.from === t || e.to === t), t).toBe(true);
      if (NEED[t] !== 'required') continue;
      for (const p of NODE_DEFINITIONS[t].inputs.filter((p) => p.required)) {
        expect(RECIPE.edges.some((e) => e.to === t && e.port === p.id), `${t}.${p.id}`).toBe(true);
      }
    }
  });
});
