'use client';

import { useRef, useState, type DragEvent } from 'react';
import { Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MAX_ASSETS, MAX_BYTES } from '@/lib/asset-upload';
import {
  dataUrlByteSize, isReferenceRole, REFERENCE_MAX_BYTES, REFERENCE_MAX_LABEL, referenceTooBigMessage,
} from '@/lib/flow/asset-limits';
import { addImageNode, clearImageNode, isImageNode, removeImageNode, setImageRole } from '@/lib/flow/image-nodes';
import type { FlowAsset } from '@/lib/flow/schema';
import { ASSET_ROLE_OPTIONS, type AssetRole } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useFlowStore } from '@/store/flow-store';
import { readAssetFile } from '../inspector/read-asset-file';

const ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp,.png,.jpg,.jpeg,.svg,.webp';
const ROLE_ITEMS = Object.fromEntries(ASSET_ROLE_OPTIONS.map((o) => [o.value, o.label])) as Record<string, string>;

export type FieldMessage = { severity: 'error' | 'warning'; message: string };

/**
 * Field ảnh của Simple view, cùng bố cục với form cũ (AssetUploader + AssetPanel): 1 ô kéo thả / chọn nhiều tệp,
 * bên dưới là danh sách ảnh đã tải – thumbnail, tên, nút xoá, dropdown chức năng ảnh.
 * Mỗi ảnh là 1 node ảnh trong graph; ô ảnh bắt buộc của template còn trống thì được điền trước.
 */
export function ImageListField({ requiredNodeId, label, hint, messagesFor }: {
  requiredNodeId: string;
  label: string;
  hint?: string;
  messagesFor: (nodeId: string) => FieldMessage[];
}) {
  const graph = useFlowStore((s) => s.graph);
  const assetData = useFlowStore((s) => s.assetData);
  const editGraph = useFlowStore((s) => s.editGraph);
  const setAssetData = useFlowStore((s) => s.setAssetData);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const allImages = graph.nodes.filter(isImageNode);
  const images = allImages
    .filter((n) => n.params.assetId)
    .sort((a, b) => Number(b.id === requiredNodeId) - Number(a.id === requiredNodeId));
  // Ô bắt buộc còn trống: lỗi của nó ("Cần tải ảnh…") hiện dưới ô kéo thả.
  const requiredEmpty = allImages.some((n) => n.id === requiredNodeId && !n.params.assetId);

  const addFiles = async (files: File[]) => {
    const room = MAX_ASSETS - images.length;
    if (room <= 0) return toast.error(`Tối đa ${MAX_ASSETS} ảnh. Hãy xoá bớt để thêm mới.`);
    if (files.length > room) toast.error(`Chỉ còn ${room} vị trí. Các tệp dư đã bị bỏ qua.`);
    setBusy(true);
    try {
      for (const file of files.slice(0, room)) {
        // Ô ảnh bắt buộc còn trống → file này điền vào đó (theo vai trò của ô, vd. banner mẫu ≤ 4MB).
        const required = useFlowStore.getState().graph.nodes.find((n) => n.id === requiredNodeId);
        const fillRequired = Boolean(required && isImageNode(required) && !required.params.assetId);
        const res = await readAssetFile(file, fillRequired && required && isImageNode(required) ? required.params.role : 'image');
        if (!res.ok) {
          toast.error(res.message);
          continue;
        }
        setAssetData(res.patch.assetId, res.dataUrl);
        if (fillRequired) {
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
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) void addFiles(files);
  };

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="mb-1.5 p-0 text-xs font-medium">{label}</legend>

      <div
        role="region"
        aria-label="Kéo thả ảnh vào đây hoặc chọn tệp để tải lên"
        onDragEnter={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          dragDepth.current += 1;
          setDragActive(true);
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setDragActive(false);
        }}
        onDrop={onDrop}
        className={cn(
          'flex items-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 px-3 py-3 transition-colors',
          dragActive && 'border-primary bg-primary/5',
        )}
      >
        <Upload className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{busy ? 'Đang đọc ảnh…' : 'Kéo thả nhiều ảnh vào đây'}</p>
          <p className="text-xs text-muted-foreground">PNG, JPG, SVG, WebP · ≤ {MAX_BYTES / (1024 * 1024)}MB · tham chiếu ≤ {REFERENCE_MAX_LABEL}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          Chọn tệp
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          aria-label="Chọn tệp ảnh để tải lên"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length) void addFiles(files);
          }}
        />
      </div>

      {requiredEmpty && messagesFor(requiredNodeId).map((m, k) => (
        <p key={k} className={m.severity === 'error' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>{m.message}</p>
      ))}

      {images.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Ảnh đã tải lên">
          {images.map((n) => {
            const params = n.params as FlowAsset;
            const src = params.url || assetData[params.assetId];
            const messages = messagesFor(n.id);
            return (
              <li key={n.id} className="flex flex-col gap-1 rounded-lg border bg-card p-2 shadow-xs">
                <div className="flex gap-2.5">
                  <div className="flow-checker relative size-12 shrink-0 overflow-hidden rounded-md ring-1 ring-border">
                    {src
                      // eslint-disable-next-line @next/next/no-img-element -- blob/data URL ảnh user tải lên
                      ? <img src={src} alt="" className="size-full object-contain" draggable={false} />
                      : <span className="grid size-full place-items-center text-[10px] text-muted-foreground">Trống</span>}
                    {n.id === requiredNodeId && (
                      <Badge variant="secondary" className="pointer-events-none absolute top-0.5 left-0.5 h-3.5 px-1 text-[9px] leading-none">{n.type === 'reference-image' ? 'Mẫu' : 'Chính'}</Badge>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-xs font-medium" title={params.fileName}>{params.fileName}</p>
                      <Button
                        type="button" variant="ghost" size="icon-xs"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label={`Xoá ảnh ${params.fileName}`}
                        onClick={() => editGraph((g) => (n.id === requiredNodeId ? clearImageNode(g, n.id) : removeImageNode(g, n.id)))}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                    <label htmlFor={`img-role-${n.id}`} className="sr-only">Chức năng của {params.fileName}</label>
                    <Select
                      value={params.role}
                      items={ROLE_ITEMS}
                      onValueChange={(v) => {
                        if (!v) return;
                        const role = v as AssetRole;
                        // Đổi sang ảnh tham chiếu: ảnh đã tải phải dưới giới hạn tham chiếu.
                        const data = assetData[params.assetId];
                        if (isReferenceRole(role) && data && dataUrlByteSize(data) > REFERENCE_MAX_BYTES) {
                          toast.error(referenceTooBigMessage(params.fileName));
                          return;
                        }
                        editGraph((g) => setImageRole(g, n.id, role));
                      }}
                    >
                      <SelectTrigger id={`img-role-${n.id}`} size="sm" className="h-7 w-full min-w-0 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSET_ROLE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {!assetData[params.assetId] && <p className="text-xs text-destructive">Cần tải lại ảnh để chạy.</p>}
                {messages.map((m, k) => (
                  <p key={k} className={m.severity === 'error' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>{m.message}</p>
                ))}
              </li>
            );
          })}
        </ul>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </fieldset>
  );
}
