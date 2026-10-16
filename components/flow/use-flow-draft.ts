'use client';

import { useEffect, type RefObject } from 'react';
import { toast } from 'sonner';
import { isImageNode } from '@/lib/flow/image-nodes';
import { DEFAULT_TEMPLATES } from '@/lib/flow/template';
import { clearDraft, readDraft, readDraftAssets, syncDraftAssets, writeDraft } from '@/lib/flow-ui/flow-draft';
import { useFlowStore } from '@/store/flow-store';

const SAVE_DELAY_MS = 800;

/** Không có gì đáng giữ: template vừa nạp chưa sửa, hoặc project đã lưu chưa sửa (mở lại từ menu project). */
function nothingToKeep(): boolean {
  const s = useFlowStore.getState();
  return (!s.docId && s.graph === s.templateBaseline) || (Boolean(s.docId) && s.graph === s.savedGraph);
}

function saveNow(userId: string) {
  if (nothingToKeep()) return clearDraft(userId);
  const s = useFlowStore.getState();
  writeDraft(userId, {
    graph: s.graph, exposed: s.exposed, templateId: s.templateId, docId: s.docId, docTitle: s.docTitle, view: s.view,
  });
  const used = new Set(s.graph.nodes.filter(isImageNode).map((n) => n.params.assetId).filter(Boolean));
  void syncDraftAssets(userId, Object.fromEntries(Object.entries(s.assetData).filter(([id]) => used.has(id))));
}

/**
 * Mở lại bản nháp trên máy nếu có. Trả true khi đã khôi phục. Ảnh nạp từ IndexedDB sau (không chặn hiển thị).
 */
export function restoreFlowDraft(userId: string): boolean {
  const draft = readDraft(userId);
  if (!draft) return false;
  const store = useFlowStore.getState();
  store.restoreDraft(draft);
  const ids = draft.graph.nodes.filter(isImageNode).map((n) => n.params.assetId).filter(Boolean);
  if (ids.length) {
    void readDraftAssets(userId, ids).then((data) => {
      for (const [id, url] of Object.entries(data)) useFlowStore.getState().setAssetData(id, url);
    });
  }
  const time = new Date(draft.savedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  toast.success(`Đã mở lại bản nháp lúc ${time}.`, {
    duration: 8000,
    action: {
      label: 'Bỏ nháp',
      onClick: () => {
        clearDraft(userId);
        useFlowStore.getState().loadTemplate(DEFAULT_TEMPLATES[0]!);
      },
    },
  });
  return true;
}

/**
 * Tự lưu nháp khi graph/project/ảnh đổi (trễ 800ms) và khi rời trang. `readyRef` = đã quyết định nạp gì (doc / template /
 * nháp) – trước đó không lưu, tránh ghi đè nháp bằng template mặc định.
 */
export function useFlowDraftAutosave(userId: string | null | undefined, readyRef: RefObject<boolean>) {
  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = false;
    const unsub = useFlowStore.subscribe((s, p) => {
      if (s.graph === p.graph && s.exposed === p.exposed && s.docId === p.docId && s.docTitle === p.docTitle
        && s.view === p.view && s.assetData === p.assetData && s.savedGraph === p.savedGraph) return;
      if (!readyRef.current) return;
      clearTimeout(timer);
      pending = true;
      timer = setTimeout(() => {
        pending = false;
        saveNow(userId);
      }, SAVE_DELAY_MS);
    });
    const flush = () => {
      if (!readyRef.current) return;
      clearTimeout(timer);
      pending = false;
      saveNow(userId);
    };
    window.addEventListener('pagehide', flush);
    return () => {
      unsub();
      window.removeEventListener('pagehide', flush);
      // Rời /flow trong app (điều hướng client): lưu nốt thay đổi đang chờ.
      if (pending) flush();
    };
  }, [userId, readyRef]);
}
