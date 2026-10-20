/**
 * Class Tailwind theo token Flow Canvas (app/globals.css: --color-port-*, --color-node-*, --color-run-*).
 * Viết đủ chuỗi tĩnh, không ghép bằng template string, để Tailwind quét được.
 */
import type { NodeKind } from '@/lib/flow/node-definitions';
import type { RunState } from '@/lib/flow/run-state';
import type { PortType } from '@/lib/flow/schema';

/**
 * Màu handle theo kiểu port. Là class trong flow-theme.css (không phải utility bg-*):
 * CSS của React Flow không nằm trong cascade layer nên luôn thắng utility trong @layer utilities.
 */
export const PORT_HANDLE: Record<PortType, string> = {
  product: 'flow-port-product',
  image: 'flow-port-image',
  brief: 'flow-port-brief',
  text: 'flow-port-text',
  brand: 'flow-port-brand',
  ratio: 'flow-port-ratio',
  style: 'flow-port-style',
  raster: 'flow-port-raster',
};

/** Class gắn vào edge (xem flow-theme.css) để tô dây theo kiểu port nguồn. */
export const EDGE_CLASS: Record<PortType, string> = {
  product: 'flow-edge-product',
  image: 'flow-edge-image',
  brief: 'flow-edge-brief',
  text: 'flow-edge-text',
  brand: 'flow-edge-brand',
  ratio: 'flow-edge-ratio',
  style: 'flow-edge-style',
  raster: 'flow-edge-raster',
};

/** Chip icon theo nhóm node (nền nhạt + icon đậm). */
export const KIND_CHIP: Record<NodeKind, string> = {
  input: 'bg-node-input/12 text-node-input',
  config: 'bg-node-config/12 text-node-config',
  executor: 'bg-node-executor/12 text-node-executor',
  output: 'bg-node-output/12 text-node-output',
};

export const KIND_LABELS: Record<NodeKind, string> = {
  input: 'Đầu vào',
  config: 'Cấu hình',
  executor: 'Tạo ảnh (AI)',
  output: 'Đầu ra',
};

/** Viền card theo trạng thái chạy; idle/queued dùng viền mặc định. */
export const RUN_BORDER: Record<RunState, string> = {
  idle: 'border-border',
  queued: 'border-border',
  stale: 'border-run-stale',
  running: 'border-run-running',
  done: 'border-border',
  error: 'border-destructive',
};

/** Pill trạng thái trên header card. */
export const RUN_PILL: Record<RunState, string> = {
  idle: '',
  queued: 'bg-muted text-muted-foreground',
  stale: 'bg-run-stale/15 text-run-stale',
  running: 'bg-run-running/15 text-run-running',
  done: 'bg-run-done/15 text-run-done',
  error: 'bg-destructive/10 text-destructive',
};

export const RUN_DOT: Record<RunState, string> = {
  idle: '',
  queued: 'bg-muted-foreground',
  stale: 'bg-run-stale',
  running: 'bg-run-running animate-pulse motion-reduce:animate-none',
  done: 'bg-run-done',
  error: 'bg-destructive',
};
