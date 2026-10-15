'use client';

import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { requestGenerationWithPayload } from '@/lib/client-generation';
import { estimateAiCalls } from '@/lib/flow/compiled-job';
import { compileGraph } from '@/lib/flow/compiler';
import type { BackgroundRequest } from '@/lib/flow/background/request';
import { runAll, type BackgroundResult, type GenerateResult } from '@/lib/flow/executor';
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

/** Run all (T2.6) + số lượt gọi AI ước tính, hiển thị trước khi chạy (SPEC 5.3). */
export function useFlowRun() {
  const graph = useFlowStore((s) => s.graph);
  const isRunning = useFlowStore((s) => s.isRunning);

  const aiCalls = useMemo(() => {
    const compiled = compileGraph(graph);
    return compiled.ok ? estimateAiCalls(compiled.job) : null;
  }, [graph]);

  const run = useCallback(async () => {
    const store = useFlowStore.getState();
    if (store.isRunning) return;
    store.startRun();
    // Font phải tải xong trước khi đo/vẽ chữ, nếu không Canvas đo bằng font dự phòng.
    await ensureFonts(store.graph.nodes
      .filter((n) => n.type === 'text-layer')
      .map((n) => (n.params as NodeParamsMap['text-layer']).style)).catch(() => {});
    const outcome = await runAll(store.graph, { dataUrls: store.assetData }, {
      generate,
      generateBackground,
      renderGuide: renderGuideImage,
      measurer: canvasMeasurer,
      composeRatio,
      onRunInfo: (nodeId, info) => useFlowStore.getState().setRunInfo(nodeId, info),
    });
    useFlowStore.getState().finishRun(outcome.results);

    if (outcome.ok) {
      toast.success(`Đã tạo ${outcome.results.length} ảnh.`);
      if (outcome.warnings.length) toast.warning(`${outcome.warnings.length} cảnh báo: ${outcome.warnings[0]!.message}`);
      return;
    }
    // Lỗi gắn với node đã hiện trên node; toast tóm tắt + lỗi chung (không thuộc node nào).
    const general = outcome.errors.filter((e) => !e.nodeId);
    toast.error(general[0]?.message ?? `Chạy thất bại: ${outcome.errors[0]?.message ?? 'lỗi không xác định.'}`);
  }, []);

  return { run, isRunning, aiCalls };
}
