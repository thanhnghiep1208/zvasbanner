'use client';

import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { requestGenerationWithPayload } from '@/lib/client-generation';
import { estimateAiCalls } from '@/lib/flow/compiled-job';
import { compileGraph } from '@/lib/flow/compiler';
import { runAll, type GenerateResult } from '@/lib/flow/executor';
import { useFlowStore } from '@/store/flow-store';

/** Gọi /api/generate qua client hiện có (timeout, map lỗi HTTP → message tiếng Việt giữ nguyên như form). */
async function generate(request: Parameters<typeof requestGenerationWithPayload>[0]): Promise<GenerateResult> {
  const res = await requestGenerationWithPayload(request);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, image: res.image, source: res.source, placeholderError: res.placeholderError };
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
    const outcome = await runAll(store.graph, { dataUrls: store.assetData }, {
      generate,
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
