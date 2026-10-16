'use client';

/**
 * "Mở trong canvas" từ form cũ (T6.2, Q5A): state editor → GenerationRequest (đúng hàm form dùng khi tạo ảnh)
 * → fromLegacyConfig → decompileJob. Graph flat (Q5A) – chạy ra cùng request với form (parity T2.7).
 * Ảnh: dataUrl chuyển sang assetData của flow store, blob URL của form vẫn dùng được làm preview (cùng phiên).
 */
import { buildGeneratePayloadFromStore } from '@/lib/client-generation';
import { decompileJob } from '@/lib/flow/decompiler';
import { fromLegacyConfig } from '@/lib/flow/legacy/from-legacy-config';
import type { FlowGraph } from '@/lib/flow/schema';
import { useEditorStore } from '@/store/editor';
import { useFlowStore } from '@/store/flow-store';

export function graphFromEditorState(): { graph: FlowGraph; dataUrls: Record<string, string>; title: string } {
  const s = useEditorStore.getState();
  const request = buildGeneratePayloadFromStore(s.canvasConfig);
  // Truyền text form riêng (lossless) thay vì tách lại từ userPrompt đã ghép.
  const { job, runtime } = fromLegacyConfig(request, {
    form: { userPrompt: s.userPrompt, headline: s.headline, subheadline: s.subheadline, ctaText: s.ctaText },
  });
  const title = s.headline.trim() || `Từ form – ${s.canvasConfig.name}`;
  return { graph: decompileJob(job), dataUrls: runtime.dataUrls, title };
}

/** Nạp state form vào flow store (project mới chưa lưu, Canvas view). Gọi trước khi chuyển sang /flow. */
export function loadEditorStateIntoFlow(): void {
  const { graph, dataUrls, title } = graphFromEditorState();
  const flow = useFlowStore.getState();
  flow.setGraph(graph);
  for (const [assetId, dataUrl] of Object.entries(dataUrls)) flow.setAssetData(assetId, dataUrl);
  flow.setDocTitle(title);
}
