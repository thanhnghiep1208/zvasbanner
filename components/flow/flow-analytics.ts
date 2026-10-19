'use client';

/**
 * Gửi analytics Flow canvas (T6.3, SPEC 5.9) → POST /api/flow/track. Fire-and-forget: lỗi mạng/server không
 * được làm hỏng thao tác của user, chỉ log console.
 */
import { track } from '@/lib/analytics';
import type { FlowAnalyticsEventName, FlowAnalyticsPropsMap } from '@/lib/analytics-events';
import type { RunIssue } from '@/lib/flow/executor';
import type { FlowGraph } from '@/lib/flow/schema';
import { useFlowStore } from '@/store/flow-store';

/** 1 phiên = 1 lần tải trang (module nạp lại khi reload). */
let sessionId: string | null = null;
function getSessionId(): string {
  sessionId ??= crypto.randomUUID();
  return sessionId;
}

export function trackFlow<E extends FlowAnalyticsEventName>(event: E, props: FlowAnalyticsPropsMap[E]): void {
  const { docId, templateId } = useFlowStore.getState();
  const body = { event, session_id: getSessionId(), doc_id: docId, template_id: templateId, timestamp: Date.now(), ...props };
  void fetch('/api/flow/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true, // vẫn gửi được khi user rời trang ngay sau đó
  }).then(
    (res) => { if (!res.ok) console.warn(`[flow-track] ${event}: HTTP ${res.status}`); },
    (e) => console.warn(`[flow-track] ${event}`, e),
  );
}

type GenerationMeta = {
  model: string; elapsedMs: number; promptTokens?: number; outputTokens?: number; totalTokens?: number; costUsd?: number;
};

/**
 * Mỗi lượt AI thật của flow (flat: /api/generate, composed: /api/flow/generate-background) → 1 `generate_banner`
 * trong banner_events, để dashboard đếm số ảnh, model, token và chi phí giống form. Ảnh lấy từ cache không gọi hàm này.
 */
export function trackFlowGeneration(args: {
  bannerId?: string; source: 'gemini' | 'placeholder'; meta?: GenerationMeta; hasAsset: boolean;
  context: 'flow_flat' | 'flow_background';
}): void {
  const { meta } = args;
  void track('generate_banner', {
    banner_id: args.bannerId ?? crypto.randomUUID(),
    user_id: 'unknown', // /api/track lấy user_id từ session
    source: args.source,
    success: args.source === 'gemini',
    image_model: meta?.model,
    has_asset: args.hasAsset,
    generation_time_ms: meta?.elapsedMs,
    regenerate_count: 0,
    cost_usd: meta?.costUsd ?? 0,
    prompt_tokens: meta?.promptTokens,
    output_tokens: meta?.outputTokens,
    total_tokens: meta?.totalTokens,
    generation_context: args.context,
  }).catch((e) => console.warn('[flow-track] generate_banner', e));
}

/** Nguồn mở /flow lần này – đặt trước khi điều hướng (vd. "Mở trong canvas" từ form), đọc 1 lần khi /flow mount. */
let pendingOpenSource: FlowAnalyticsPropsMap['flow_opened']['source'] | null = null;
export function markFlowOpenSource(source: FlowAnalyticsPropsMap['flow_opened']['source']): void {
  pendingOpenSource = source;
}
export function takeFlowOpenSource(): FlowAnalyticsPropsMap['flow_opened']['source'] | null {
  const s = pendingOpenSource;
  pendingOpenSource = null;
  return s;
}

/**
 * Mã lỗi gọn cho flow_run_failed: mã server/client trong message (`[E-BG-…]`, `[E-GEN-…]`), không có thì theo loại
 * node lỗi (`node:product-asset` – vd. chưa tải ảnh), không có node thì `graph` (lỗi compile chung).
 */
export function runErrorCode(errors: readonly RunIssue[], graph: FlowGraph): string {
  const first = errors[0];
  if (!first) return 'unknown';
  const m = /\[(E-[A-Z0-9_-]+)\]/.exec(first.message);
  if (m) return m[1]!;
  const node = first.nodeId ? graph.nodes.find((n) => n.id === first.nodeId) : undefined;
  return node ? `node:${node.type}` : 'graph';
}
