import { describe, expect, it } from 'vitest';
import { convertComposedDoc, migrateFlowDoc, parseStoredFlowDoc, serializeFlowDoc } from '../persistence';
import { compileGraph } from '../compiler';
import { decompileJob } from '../decompiler';
import { validateGraph } from '../validate';
import { flatMinimal } from './fixtures';

describe('persistence', () => {
  it('serialize → JSON → migrate giữ nguyên graph', () => {
    const doc = serializeFlowDoc(decompileJob(flatMinimal), { x: 0, y: 0, zoom: 1 });
    expect(migrateFlowDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });
  it('doc từ version tương lai bị từ chối', () => {
    expect(() => migrateFlowDoc({ schemaVersion: 99, graph: { nodes: [], edges: [] } })).toThrow();
  });
  it('dữ liệu rác bị từ chối', () => {
    expect(() => migrateFlowDoc({ foo: 1 })).toThrow();
  });
});

describe('project cũ dùng Ghép layer (đã gỡ 2026-10-20)', () => {
  /** Graph như decompileJob của bản có Ghép layer sinh ra (template "Sản phẩm nổi bật" cũ). */
  function oldComposedDoc() {
    const flat = decompileJob(flatMinimal);
    const keep = flat.nodes.filter((n) => n.type !== 'generate-flat');
    const edge = (source: string, sourcePort: string, target: string, targetPort: string) =>
      ({ id: `e-${source}.${sourcePort}-${target}.${targetPort}`, source, sourcePort, target, targetPort });
    return {
      schemaVersion: 1,
      graph: {
        nodes: [
          ...keep,
          { id: 'n-layout', type: 'auto-layout', params: { overrides: {} }, position: { x: 560, y: 0 } },
          { id: 'n-generate', type: 'generate-background', params: { model: 'nano-banana-pro', lightDirectionDeg: 315, strictNoText: true }, position: { x: 840, y: 0 } },
          { id: 'n-compose', type: 'compose', params: { shadow: { mode: 'auto', opacity: 0.5, blurPx: 24, offsetX: 0, offsetY: 8 } }, position: { x: 1120, y: 0 } },
        ],
        edges: [
          edge('n-ratio', 'ratio', 'n-layout', 'ratio'),
          edge('n-product-0', 'product', 'n-layout', 'product'),
          edge('n-text-headline', 'text', 'n-layout', 'text'),
          edge('n-layout', 'layout', 'n-generate', 'layout'),
          edge('n-brief', 'brief', 'n-generate', 'brief'),
          edge('n-generate', 'background', 'n-compose', 'background'),
          edge('n-layout', 'layout', 'n-compose', 'layout'),
          edge('n-product-0', 'product', 'n-compose', 'product'),
          edge('n-text-headline', 'text', 'n-compose', 'text'),
          edge('n-compose', 'composition', 'n-export', 'composition'),
        ],
      },
      exposed: [
        { id: 'headline', nodeId: 'n-text-headline', path: ['content'], label: 'Tiêu đề', control: 'text' },
        { id: 'headline-color', nodeId: 'n-text-headline', path: ['style', 'fill', 'color'], label: 'Màu', control: 'color' },
        { id: 'shadow', nodeId: 'n-compose', path: ['shadow', 'opacity'], label: 'Bóng', control: 'number' },
      ],
    };
  }

  it('mở được: thay 3 node cũ bằng Tạo banner nối đủ input, chạy được như flat', () => {
    const doc = parseStoredFlowDoc(oldComposedDoc());
    const types = doc.graph.nodes.map((n) => n.type);
    expect(types).not.toContain('compose');
    expect(types).not.toContain('auto-layout');
    expect(types).not.toContain('generate-background');
    const gen = doc.graph.nodes.find((n) => n.type === 'generate-flat')!;
    expect(gen).toMatchObject({ id: 'n-generate-flat', params: { model: 'nano-banana-pro', strictPreserveMode: true }, position: { x: 840, y: 0 } });
    expect(validateGraph(doc.graph).filter((i) => i.severity === 'error')).toEqual([]);
    const res = compileGraph(doc.graph);
    expect(res.ok && res.job).toMatchObject({ renderMode: 'flat', model: 'nano-banana-pro', ratios: flatMinimal.ratios });
    expect(res.ok && res.job.products.map((p) => p.assetId)).toEqual(['asset-noi-chien']);
    expect(res.ok && res.job.textLayers.map((t) => t.layerId)).toEqual(['headline']);
  });

  it('bỏ field Simple view của node đã gỡ và của kiểu chữ', () => {
    expect(parseStoredFlowDoc(oldComposedDoc()).exposed!.map((e) => e.id)).toEqual(['headline']);
  });

  it('graph đã là flat → giữ nguyên', () => {
    const doc = serializeFlowDoc(decompileJob(flatMinimal));
    expect(convertComposedDoc(doc)).toBe(doc);
  });
});
