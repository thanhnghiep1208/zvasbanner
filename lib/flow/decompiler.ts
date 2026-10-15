import type { FlowEdge, FlowGraph, FlowNode, NodeParamsMap, NodeType } from './schema';
import { makeEdgeId } from './schema';
import type { CompiledJob } from './compiled-job';
import { NODE_DEFINITIONS } from './node-definitions';

/**
 * CompiledJob → graph. Dùng cho: migrate project cũ, sinh graph từ template.
 * ID node xác định (deterministic) để diff/migrate ổn định.
 */
export function decompileJob(job: CompiledJob): FlowGraph {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  /** Toạ độ y kế tiếp của mỗi cột (px). */
  const col = { input: 0, config: 0 };

  const add = <T extends NodeType>(
    id: string, type: T, params: NodeParamsMap[T], x: number, y?: number,
  ): FlowNode<T> => {
    const key = x === COL.input ? 'input' : x === COL.config ? 'config' : null;
    const rowY = key ? col[key] : 0;
    if (key) col[key] += estimateNodeHeight(type, params) + NODE_GAP;
    // Sao chép: graph không được dùng chung object với job (sửa node sẽ làm đổi job/fixture).
    const node: FlowNode<T> = { id, type, params: structuredClone(params), position: { x, y: y ?? rowY } };
    nodes.push(node as FlowNode);
    return node;
  };
  const link = (source: string, sourcePort: string, target: string, targetPort: string) => {
    edges.push({ id: makeEdgeId(source, sourcePort, target, targetPort), source, sourcePort, target, targetPort });
  };

  const brief = add('n-brief', 'brief', job.brief, COL.input);
  const products = job.products.map((p, i) => add(`n-product-${i}`, 'product-asset', p, COL.input));
  const texts = job.textLayers.map((t) => add(`n-text-${t.layerId}`, 'text-layer', t, COL.input));
  const refs = job.references.map((r, i) => add(`n-ref-${i}`, 'reference-image', r, COL.input));

  const ratio = add('n-ratio', 'ratio', { ratios: job.ratios }, COL.config);
  const style = job.style ? add('n-style', 'style', job.style, COL.config) : undefined;
  const brand = job.brandKit ? add('n-brand', 'brand-kit', job.brandKit, COL.config) : undefined;

  const exportNode = (x: number) => add('n-export', 'export', job.export, x, 0);

  if (job.renderMode === 'composed') {
    const c = job.composed!;
    const layout = add('n-layout', 'auto-layout', { overrides: c.layoutOverrides }, COL.layout, 0);
    const gen = add('n-generate', 'generate-background', {
      model: job.model, lightDirectionDeg: c.lightDirectionDeg, strictNoText: c.strictNoText,
    }, COL.exec, 0);
    const compose = add('n-compose', 'compose', { shadow: c.shadow }, COL.compose, 0);
    const ex = exportNode(COL.export);

    link(ratio.id, 'ratio', layout.id, 'ratio');
    for (const p of products) link(p.id, 'product', layout.id, 'product');
    for (const t of texts) link(t.id, 'text', layout.id, 'text');

    link(layout.id, 'layout', gen.id, 'layout');
    link(brief.id, 'brief', gen.id, 'brief');
    if (style) link(style.id, 'style', gen.id, 'style');
    if (brand) link(brand.id, 'brand', gen.id, 'brand');
    for (const r of refs) link(r.id, 'image', gen.id, 'image');

    link(gen.id, 'background', compose.id, 'background');
    link(layout.id, 'layout', compose.id, 'layout');
    for (const p of products) link(p.id, 'product', compose.id, 'product');
    for (const t of texts) link(t.id, 'text', compose.id, 'text');

    link(compose.id, 'composition', ex.id, 'composition');
  } else {
    const f = job.flat!;
    const gen = add('n-generate-flat', 'generate-flat', {
      model: job.model, strictPreserveMode: f.strictPreserveMode,
    }, COL.exec, 0);
    link(ratio.id, 'ratio', gen.id, 'ratio');
    link(brief.id, 'brief', gen.id, 'brief');
    for (const p of products) link(p.id, 'product', gen.id, 'product');
    for (const t of texts) link(t.id, 'text', gen.id, 'text');
    if (style) link(style.id, 'style', gen.id, 'style');
    if (brand) link(brand.id, 'brand', gen.id, 'brand');
    for (const r of refs) link(r.id, 'image', gen.id, 'image');

    const ex = exportNode(COL.export);
    link(gen.id, 'raster', ex.id, 'raster');
  }

  return { nodes, edges };
}

/** Khoảng trống giữa 2 node xếp chồng trong cột. */
const NODE_GAP = 32;
const COL = { input: 0, config: 280, layout: 560, exec: 840, compose: 1120, export: 1400 } as const;

/**
 * Chiều cao (px) ước tính của node card (components/flow/nodes/FlowNodeCard) để xếp node trong cột không đè nhau.
 * Hiệu chỉnh theo đo thực tế trên canvas: header ~60, mỗi port 24 (+12 đệm), khối chi tiết (chữ đầy đủ ~30 ký tự/dòng
 * × 17px, chip ~3/hàng × 22px), thumbnail ảnh ~124, danh sách kích thước 20px/size. Ước dư một chút là được.
 */
export function estimateNodeHeight(type: NodeType, params: unknown): number {
  const def = NODE_DEFINITIONS[type];
  const ports = def.inputs.length + def.outputs.length;
  const h = 60 + (ports ? ports * 24 + 12 : 0);
  const details = (textLen: number | null, chips: number) => {
    const lines = textLen === null ? 0 : Math.max(1, Math.ceil(textLen / 30));
    const chipRows = Math.ceil(chips / 3);
    return 16 + lines * 17 + (lines && chipRows ? 8 : 0) + chipRows * 22;
  };
  switch (type) {
    case 'product-asset': case 'reference-image':
      return h + 124; // thumbnail khi đã upload
    case 'ratio':
      return h + 16 + 20 * (params as NodeParamsMap['ratio']).ratios.length;
    case 'text-layer': {
      const p = params as NodeParamsMap['text-layer'];
      const s = p.style;
      const chips = 4 + [p.renderSource === 'ai', s.textTransform === 'uppercase', s.italic, s.maxLines > 0,
        !!s.stroke, !!s.shadow, !!s.plate].filter(Boolean).length;
      return h + details(p.content.length, chips);
    }
    case 'brief': {
      const p = params as NodeParamsMap['brief'];
      return h + details(p.prompt.length, p.marketingBrief.campaignIntents.length + p.marketingBrief.focalSubjects.length);
    }
    case 'style': {
      const bg = (params as NodeParamsMap['style']).backgroundConfig;
      return h + details(null, 4 + bg.tones.length + bg.grains.length + bg.shapes.length + bg.effects.length);
    }
    case 'brand-kit': {
      const p = params as NodeParamsMap['brand-kit'];
      return h + details(null, p.colors.length + (p.fontPreference ? 1 : 0) + (p.logoPosition ? 1 : 0));
    }
    default:
      return h;
  }
}

