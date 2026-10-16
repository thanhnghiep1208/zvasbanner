'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { serializeFlowDoc, stripRuntimeAssets } from '@/lib/flow/persistence';
import { flowDocsApi } from '@/lib/flow-ui/docs-api';
import { useFlowStore } from '@/store/flow-store';

/** Đưa id project lên URL (`/flow?doc=<id>`) để tải lại trang / chia sẻ link cho chính mình mở lại đúng project. */
export function setDocUrl(id: string | null) {
  const url = new URL(window.location.href);
  url.searchParams.delete('template');
  if (id) url.searchParams.set('doc', id);
  else url.searchParams.delete('doc');
  window.history.replaceState(window.history.state, '', url);
}

/** Lưu / mở project (T6.1). Ảnh không được lưu (Q7B). */
export function useFlowDocs() {
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    const s = useFlowStore.getState();
    // Chụp graph lúc bấm: user sửa tiếp trong lúc chờ thì vẫn còn "có thay đổi".
    const graph = s.graph;
    const doc = serializeFlowDoc(stripRuntimeAssets(graph), undefined, {
      templateId: s.templateId ?? undefined, exposed: s.exposed,
    });
    setSaving(true);
    try {
      const firstSave = !s.docId;
      const saved = s.docId ? await flowDocsApi.update(s.docId, s.docTitle, doc) : await flowDocsApi.create(s.docTitle, doc);
      useFlowStore.getState().markSaved({ id: saved.id, title: saved.title, graph });
      setDocUrl(saved.id);
      const hasImage = graph.nodes.some((n) => (n.type === 'product-asset' || n.type === 'reference-image')
        && (n.params as { fileName?: string }).fileName);
      toast.success('Đã lưu project.', {
        description: firstSave && hasImage ? 'Ảnh không được lưu – mở lại project cần tải lại ảnh.' : undefined,
      });
      return true;
    } catch (e) {
      toast.error(`Lưu thất bại: ${(e as Error).message}`);
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const open = useCallback(async (id: string) => {
    try {
      const rec = await flowDocsApi.get(id);
      useFlowStore.getState().loadDoc({ id: rec.id, title: rec.title, doc: rec.doc });
      setDocUrl(rec.id);
      return true;
    } catch (e) {
      toast.error(`Không mở được project: ${(e as Error).message}`);
      return false;
    }
  }, []);

  return { save, open, saving };
}
