import type { FlowEdge, FlowGraph, FlowNode, NodeType } from './schema';
import { FLOW_SCHEMA_VERSION } from './schema';
import type { CompiledJob } from './compiled-job';
import { validateGraph, type ValidationIssue } from './validate';

export type CompileResult =
  | { ok: true; job: CompiledJob; warnings: ValidationIssue[] }
  | { ok: false; errors: ValidationIssue[] };

/** Graph → CompiledJob: Xuất ảnh ← Tạo banner (flat, harmony pass nằm trong generate-flat, Q4). */
export function compileGraph(graph: FlowGraph): CompileResult {
  const issues = validateGraph(graph);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length) return { ok: false, errors };
  const warnings = issues.filter((i) => i.severity === 'warning');

  const g = new GraphReader(graph);
  const exportNode = graph.nodes.find((n) => n.type === 'export') as FlowNode<'export'>;
  const flat = g.node(g.incoming(exportNode.id)[0]!.source, 'generate-flat');

  return {
    ok: true,
    warnings,
    job: {
      schemaVersion: FLOW_SCHEMA_VERSION,
      renderMode: 'flat',
      ratios: g.single(flat.id, 'ratio', 'ratio').params.ratios,
      brief: g.single(flat.id, 'brief', 'brief').params,
      style: g.optional(flat.id, 'style', 'style')?.params,
      brandKit: g.optional(flat.id, 'brand', 'brand-kit')?.params,
      references: g.many(flat.id, 'image', 'reference-image').map((n) => n.params),
      model: flat.params.model,
      products: g.many(flat.id, 'product', 'product-asset').map((n) => n.params),
      textLayers: g.many(flat.id, 'text', 'text-layer').map((n) => n.params),
      flat: { strictPreserveMode: flat.params.strictPreserveMode },
      export: exportNode.params,
    },
  };
}

/** Helper đọc graph đã validate. Thứ tự edge = thứ tự trong graph.edges (ổn định). */
class GraphReader {
  private byId: Map<string, FlowNode>;
  constructor(private graph: FlowGraph) {
    this.byId = new Map(graph.nodes.map((n) => [n.id, n]));
  }
  incoming(nodeId: string, port?: string): FlowEdge[] {
    return this.graph.edges.filter((e) => e.target === nodeId && (!port || e.targetPort === port));
  }
  node<T extends NodeType>(id: string, type: T): FlowNode<T> {
    const n = this.byId.get(id);
    if (!n) throw new Error(`Node ${id} không tồn tại`);
    if (n.type !== type) throw new Error(`Node ${id} phải là ${type}, nhận ${n.type}`);
    return n as FlowNode<T>;
  }
  many<T extends NodeType>(nodeId: string, port: string, type: T): FlowNode<T>[] {
    return this.incoming(nodeId, port).map((e) => this.node(e.source, type));
  }
  optional<T extends NodeType>(nodeId: string, port: string, type: T): FlowNode<T> | undefined {
    return this.many(nodeId, port, type)[0];
  }
  single<T extends NodeType>(nodeId: string, port: string, type: T): FlowNode<T> {
    const n = this.optional(nodeId, port, type);
    if (!n) throw new Error(`Thiếu input ${port} cho node ${nodeId}`);
    return n;
  }
}
