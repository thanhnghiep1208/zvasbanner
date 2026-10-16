'use client';

import { useRef, useState, type DragEvent } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { addImageNode, isImageNode, removeImageNode, setImageRole } from '@/lib/flow/image-nodes';
import type { FlowAsset, NodeParamsMap } from '@/lib/flow/schema';
import { ASSET_ROLE_OPTIONS, type AssetRole } from '@/lib/types';
import { useFlowStore } from '@/store/flow-store';
import { AssetEditor } from '../inspector/AssetEditor';
import { SelectField } from '../inspector/fields';
import { readAssetFile } from '../inspector/read-asset-file';

const ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp,.png,.jpg,.jpeg,.svg,.webp';

export type FieldMessage = { severity: 'error' | 'warning'; message: string };

/**
 * Field ảnh của Simple view: mọi node ảnh trong graph (ảnh template lộ ra đứng đầu), mỗi ảnh chọn được loại
 * (sản phẩm, logo, trang trí, nền, tham chiếu style); thêm nhiều ảnh một lần (chọn file hoặc kéo thả), xoá ảnh thêm.
 */
export function ImageListField({ requiredNodeId, label, hint, messagesFor }: {
  requiredNodeId: string;
  label: string;
  hint?: string;
  messagesFor: (nodeId: string) => FieldMessage[];
}) {
  const graph = useFlowStore((s) => s.graph);
  const editGraph = useFlowStore((s) => s.editGraph);
  const setAssetData = useFlowStore((s) => s.setAssetData);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const images = graph.nodes.filter(isImageNode).sort((a, b) => Number(b.id === requiredNodeId) - Number(a.id === requiredNodeId));

  const addFiles = async (files: File[]) => {
    setBusy(true);
    try {
      for (const file of files) {
        const res = await readAssetFile(file);
        if (!res.ok) {
          toast.error(res.message);
          continue;
        }
        setAssetData(res.patch.assetId, res.dataUrl);
        // Ô ảnh bắt buộc còn trống → điền vào đó trước, còn lại thêm ảnh mới (mặc định ảnh sản phẩm).
        const required = useFlowStore.getState().graph.nodes.find((n) => n.id === requiredNodeId);
        if (required && isImageNode(required) && !required.params.assetId) {
          useFlowStore.getState().updateNodeParams<'product-asset'>(requiredNodeId, res.patch);
        } else {
          editGraph((g) => addImageNode(g, { ...res.patch, role: 'image' }).graph);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    e.preventDefault();
    void addFiles(files);
  };

  return (
    <fieldset
      className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
      }}
      onDrop={onDrop}
    >
      <legend className="mb-1.5 p-0 text-xs font-medium">{label}</legend>

      {images.map((n, i) => {
        const params = n.params as FlowAsset;
        const messages = messagesFor(n.id);
        return (
          <div key={n.id} className="flex flex-col gap-2 rounded-lg border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Ảnh {i + 1}{n.id === requiredNodeId ? ' *' : ''}</span>
              {n.id !== requiredNodeId && (
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Xoá ảnh ${i + 1}`}
                  onClick={() => editGraph((g) => removeImageNode(g, n.id))}>
                  <Trash2 aria-hidden />
                </Button>
              )}
            </div>
            <SelectField
              label="Loại ảnh"
              value={params.role}
              options={ASSET_ROLE_OPTIONS}
              onChange={(role: AssetRole) => editGraph((g) => setImageRole(g, n.id, role))}
            />
            {/* roles 1 phần tử → AssetEditor không vẽ ô chọn vai trò riêng (đã có "Loại ảnh" ở trên). */}
            <AssetEditor nodeId={n.id} params={params as NodeParamsMap['product-asset']} roles={[params.role as 'image']} />
            {messages.map((m, k) => (
              <p key={k} className={m.severity === 'error' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>{m.message}</p>
            ))}
          </div>
        );
      })}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) void addFiles(files);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center gap-1 rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60 ${dragOver ? 'border-primary bg-primary/5 text-foreground' : ''}`}
      >
        <ImagePlus className="size-4" aria-hidden />
        <span className="font-medium text-foreground">{busy ? 'Đang đọc ảnh…' : 'Thêm ảnh'}</span>
        <span>Chọn hoặc kéo thả nhiều ảnh (sản phẩm, logo, trang trí, nền, tham chiếu style)</span>
      </button>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </fieldset>
  );
}
