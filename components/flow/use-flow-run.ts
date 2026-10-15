'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { requestGenerationWithPayload } from '@/lib/client-generation';
import type { BackgroundRequest } from '@/lib/flow/background/request';
import { pendingAiCalls, runAll, type BackgroundResult, type GenerateResult } from '@/lib/flow/executor';
import { downstreamOf } from '@/lib/flow/cache-keys';
import { imageCache, imageCacheVersion, subscribeImageCache } from '@/lib/flow-ui/image-cache';
import { renderGuideImage } from '@/lib/flow-ui/guide-image';
import { canvasMeasurer, composeRatio, ensureFonts } from '@/lib/flow-ui/compose-render';
import type { NodeParamsMap } from '@/lib/flow/schema';
import { useFlowStore } from '@/store/flow-store';

/** Gọi /api/generate qua client hiện có (timeout, map lỗi HTTP → message tiếng Việt giữ nguyên như form). */
async function generate(request: Parameters<typeof requestGenerationWithPayload>[0]): Promise<GenerateResult> {
  const res = await requestGenerationWithPayload(request);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, image: res.image, source: res.source, placeholderError: res.placeholderError };
}

/**
 * Cách truyền vùng trống khi sinh nền (Q11A, T4.2b): 'natural' = bố cục bằng lời, không ảnh guide.
 * Ảnh guide + toạ độ % ('hatched') làm model vẽ chữ/khung kiểu mockup ở square/portrait – xem docs/flow/t4.2b/.
 */
const GUIDE_STYLE = 'natural' as const;

/** Lớn hơn timeout Gemini phía server (55s) + overhead; route maxDuration = 90s. */
const BACKGROUND_TIMEOUT_MS = 92_000;

/** POST /api/flow/generate-background (composed, T4.2). Lỗi HTTP → message tiếng Việt từ server. */
async function generateBackground(request: BackgroundRequest): Promise<BackgroundResult> {
  try {
    const res = await fetch('/api/flow/generate-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(BACKGROUND_TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as { image?: unknown; error?: unknown; errorCode?: unknown } | null;
    if (res.ok && typeof json?.image === 'string') return { ok: true, image: json.image };
    const code = typeof json?.errorCode === 'string' ? `[E-BG-${json.errorCode}] ` : `[E-BG-${res.status}] `;
    return { ok: false, error: code + (typeof json?.error === 'string' ? json.error : `Sinh nền thất bại (HTTP ${res.status}).`) };
  } catch (e) {
    const timeout = e instanceof DOMException && e.name === 'TimeoutError';
    return { ok: false, error: timeout ? '[E-BG-CLIENT-TIMEOUT] Sinh nền quá thời gian chờ. Vui lòng thử lại.' : 'Không gửi được yêu cầu sinh nền.' };
  }
}

/**
 * Run all / Chạy lại từ node (T2.6, T4.7) + số lượt AI THỰC SỰ cần (trừ kết quả có sẵn trong cache), hiện trước khi
 * chạy (SPEC 5.3).
 */
export function useFlowRun() {
  const graph = useFlowStore((s) => s.graph);
  const assetData = useFlowStore((s) => s.assetData);
  const isRunning = useFlowStore((s) => s.isRunning);
  const cacheVersion = useSyncExternalStore(subscribeImageCache, imageCacheVersion, () => 0);

  const pending = useMemo(
    () => pendingAiCalls(graph, { dataUrls: assetData }, imageCache, { guideStyle: GUIDE_STYLE, measurer: canvasMeasurer }),
    // cacheVersion: cache đổi sau mỗi lần chạy → tính lại số lượt còn cần.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, assetData, cacheVersion],
  );
  const aiCalls = pending?.calls ?? null;
  const reusable = pending?.reused ?? 0;

  /** `fromNodeId`: bỏ qua cache cho node đó + mọi node phía sau (lấy biến thể mới). */
  const run = useCallback(async (fromNodeId?: string) => {
    const store = useFlowStore.getState();
    if (store.isRunning) return;
    const forceNodes = fromNodeId ? downstreamOf(store.graph, fromNodeId) : undefined;
    store.startRun();
    // Font phải tải xong trước khi đo/vẽ chữ, nếu không Canvas đo bằng font dự phòng.
    await ensureFonts(store.graph.nodes
      .filter((n) => n.type === 'text-layer')
      .map((n) => (n.params as NodeParamsMap['text-layer']).style)).catch(() => {});
    const outcome = await runAll(store.graph, { dataUrls: store.assetData }, {
      generate,
      generateBackground,
      renderGuide: renderGuideImage,
      guideStyle: GUIDE_STYLE,
      measurer: canvasMeasurer,
      composeRatio,
      cache: imageCache,
      forceNodes,
      onRunInfo: (nodeId, info) => useFlowStore.getState().setRunInfo(nodeId, info),
    });
    useFlowStore.getState().finishRun(outcome.results);

    if (outcome.ok) {
      toast.success(outcome.reused
        ? `Đã tạo ${outcome.results.length} ảnh (${outcome.reused} dùng lại kết quả trước, không tốn lượt AI).`
        : `Đã tạo ${outcome.results.length} ảnh.`);
      if (outcome.warnings.length) toast.warning(`${outcome.warnings.length} cảnh báo: ${outcome.warnings[0]!.message}`);
      return;
    }
    // Lỗi gắn với node đã hiện trên node; toast tóm tắt + lỗi chung (không thuộc node nào).
    const general = outcome.errors.filter((e) => !e.nodeId);
    toast.error(general[0]?.message ?? `Chạy thất bại: ${outcome.errors[0]?.message ?? 'lỗi không xác định.'}`);
  }, []);

  return { run, isRunning, aiCalls, reusable };
}
