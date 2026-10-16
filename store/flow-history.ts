/**
 * Undo/redo cho Flow canvas: lịch sử các bản `graph` (domain). Trạng thái hiển thị (chọn node, kéo, đo) không vào lịch sử.
 * - Gộp: thay đổi liên tiếp cách nhau < COALESCE_MS (gõ chữ, kéo node, kéo slider) = 1 bước.
 * - Nạp graph mới (template, project, nháp – `graphVersion` tăng) → xoá lịch sử.
 */
import { create } from 'zustand';
import type { FlowGraph } from '@/lib/flow/schema';
import { useFlowStore } from './flow-store';

const LIMIT = 100;
export const COALESCE_MS = 500;

interface HistoryState {
  past: FlowGraph[];
  future: FlowGraph[];
}

export const useFlowHistory = create<HistoryState>(() => ({ past: [], future: [] }));

let applying = false;
let lastChange = 0;
let lastVersion = useFlowStore.getState().graphVersion;

useFlowStore.subscribe((state, prev) => {
  if (state.graphVersion !== lastVersion) {
    lastVersion = state.graphVersion;
    lastChange = 0;
    useFlowHistory.setState({ past: [], future: [] });
    return;
  }
  if (applying || state.graph === prev.graph) return;
  const now = Date.now();
  const burst = now - lastChange < COALESCE_MS;
  lastChange = now;
  // Trong 1 loạt: bước đã ghi là ảnh TRƯỚC loạt → không ghi thêm, chỉ bỏ nhánh redo.
  useFlowHistory.setState((h) => (burst
    ? { future: [] }
    : { past: [...h.past, prev.graph].slice(-LIMIT), future: [] }));
});

function apply(graph: FlowGraph) {
  applying = true;
  try {
    useFlowStore.getState().editGraph(() => graph);
  } finally {
    applying = false;
  }
  lastChange = 0; // thao tác sau undo/redo luôn là bước mới
}

export function undo(): boolean {
  const { past, future } = useFlowHistory.getState();
  const target = past.at(-1);
  if (!target) return false;
  const current = useFlowStore.getState().graph;
  useFlowHistory.setState({ past: past.slice(0, -1), future: [current, ...future] });
  apply(target);
  return true;
}

export function redo(): boolean {
  const { past, future } = useFlowHistory.getState();
  const target = future[0];
  if (!target) return false;
  const current = useFlowStore.getState().graph;
  useFlowHistory.setState({ past: [...past, current].slice(-LIMIT), future: future.slice(1) });
  apply(target);
  return true;
}

/** Phím tắt: không bắt khi đang gõ trong ô nhập (để ô nhập tự undo chữ của nó). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
