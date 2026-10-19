import { describe, expect, it } from 'vitest';
import { NODE_DEFINITIONS } from '@/lib/flow/node-definitions';
import type { NodeType } from '@/lib/flow/schema';
import { NEED, RECIPES } from '../guide/guide-content';

const TYPES = Object.keys(NODE_DEFINITIONS) as NodeType[];

describe('guide-content – khớp registry node', () => {
  for (const r of RECIPES) {
    describe(r.title, () => {
      it('mọi dây trỏ đúng port vào có thật, cùng kiểu với port ra', () => {
        for (const e of r.edges) {
          const inPort = NODE_DEFINITIONS[e.to].inputs.find((p) => p.id === e.port);
          expect(inPort, `${e.to}.${e.port}`).toBeDefined();
          expect(NODE_DEFINITIONS[e.from].outputs.map((o) => o.type)).toContain(inPort!.type);
          expect(e.required, `${e.from}→${e.to}`).toBe(inPort!.required || (e.to === 'export'));
        }
      });

      it('node "Bắt buộc" có đủ dây cho mọi port bắt buộc, node "Không dùng" không có dây', () => {
        for (const t of TYPES) {
          const need = NEED[t][r.id];
          const touched = r.edges.some((e) => e.from === t || e.to === t);
          if (need === 'none') expect(touched, t).toBe(false);
          else expect(touched, t).toBe(true);
          if (need !== 'required') continue;
          for (const p of NODE_DEFINITIONS[t].inputs.filter((p) => p.required)) {
            expect(r.edges.some((e) => e.to === t && e.port === p.id), `${t}.${p.id}`).toBe(true);
          }
        }
      });
    });
  }
});
