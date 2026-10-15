import type { FlowEdge, FlowGraph, FlowNode, NodeParamsMap, NodeType } from './schema';
import { makeEdgeId } from './schema';
import type { CompiledJob } from './compiled-job';

/**
 * CompiledJob → graph. Dùng cho: migrate project cũ, sinh graph từ template.
 * ID node xác định (deterministic) để diff/migrate ổn định.
 */
export function decompileJob(job: CompiledJob): FlowGraph {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const col = { input: 0, config: 0 };

  const add = <T extends NodeType>(
    id: string, type: T, params: NodeParamsMap[T], x: number, y?: number,
  ): FlowNode<T> => {
    const isInput = x === COL.input;
    const row = isInput ? col.input++ : x === COL.config ? col.config++ : 0;
    // Sao chép: graph không được dùng chung object với job (sửa node sẽ làm đổi job/fixture).
    const node: FlowNode<T> = { id, type, params: structuredClone(params), position: { x, y: y ?? row * ROW_GAP } };
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

const ROW_GAP = 140;
const COL = { input: 0, config: 280, layout: 560, exec: 840, compose: 1120, export: 1400 } as const;
