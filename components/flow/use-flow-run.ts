'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { requestGenerationWithPayload } from '@/lib/client-generation';
import { pendingAiCalls, runAll, type GenerateResult } from '@/lib/flow/executor';
import { downstreamOf } from '@/lib/flow/cache-keys';
import { imageCache, imageCacheVersion, subscribeImageCache } from '@/lib/flow-ui/image-cache';
import { exportedRatios } from '@/lib/flow/compiled-job';
import { compileGraph } from '@/lib/flow/compiler';
import { runErrorCode, trackFlow, trackFlowGeneration } from './flow-analytics';
import { useFlowStore } from '@/store/flow-store';

/** Gọi /api/generate qua client hiện có (timeout, map lỗi HTTP → message tiếng Việt giữ nguyên như form). */
async function generate(request: Parameters<typeof requestGenerationWithPayload>[0]): Promise<GenerateResult> {
  const res = await requestGenerationWithPayload(request);
  if (!res.ok) return { ok: false, error: res.error };
  trackFlowGeneration({
    bannerId: res.bannerId, source: res.source, meta: res.meta, hasAsset: request.assets.length > 0, context: 'flow_flat',
  });
  return { ok: true, image: res.image, source: res.source, placeholderError: res.placeholderError };
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
    () => pendingAiCalls(graph, { dataUrls: assetData }, imageCache),
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
    // Analytics (T6.3): graph lỗi compile → không có render mode, chỉ ghi flow_run_failed.
    const compiled = compileGraph(store.graph);
    const renderMode = compiled.ok ? compiled.job.renderMode : null;
    if (compiled.ok) {
      const p = pendingAiCalls(store.graph, { dataUrls: store.assetData }, imageCache, { forceNodes });
      trackFlow('flow_run_started', {
        ai_calls: p?.calls ?? 0, reusable: p?.reused ?? 0, render_mode: compiled.job.renderMode,
        ratio_count: exportedRatios(compiled.job).length, from_node: Boolean(fromNodeId),
      });
    }
    const startedAt = performance.now();
    store.startRun();
    const outcome = await runAll(store.graph, { dataUrls: store.assetData }, {
      generate,
      cache: imageCache,
      forceNodes,
      onRunInfo: (nodeId, info) => useFlowStore.getState().setRunInfo(nodeId, info),
    });
    useFlowStore.getState().finishRun(outcome.results);
    const durationMs = Math.round(performance.now() - startedAt);
    if (outcome.ok && renderMode) {
      trackFlow('flow_run_completed', {
        duration_ms: durationMs, render_mode: renderMode, image_count: outcome.results.length, reused: outcome.reused,
      });
    } else if (!outcome.ok) {
      trackFlow('flow_run_failed', { code: runErrorCode(outcome.errors, store.graph), duration_ms: durationMs, render_mode: renderMode });
    }

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
