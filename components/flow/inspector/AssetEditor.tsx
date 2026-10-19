'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ASSET_ROLE_OPTIONS } from '@/lib/types';
import type { FlowAsset, PixelAssetRole, ReferenceAssetRole } from '@/lib/flow/schema';
import { useFlowStore } from '@/store/flow-store';
import { SelectField } from './fields';
import { readAssetFile } from './read-asset-file';

const ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp,.png,.jpg,.jpeg,.svg,.webp';

/** Upload + chọn role cho node product-asset / reference-image. Kiểm tra định dạng, dung lượng giống form. */
export function AssetEditor<R extends PixelAssetRole | ReferenceAssetRole>({ nodeId, params, roles }: {
  nodeId: string;
  params: FlowAsset<R>;
  roles: readonly R[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const update = useFlowStore((s) => s.updateNodeParams);
  const setAssetData = useFlowStore((s) => s.setAssetData);
  const dataUrl = useFlowStore((s) => (params.assetId ? s.assetData[params.assetId] : undefined));
  const hasData = Boolean(dataUrl);
  // Project mở lại (T6.1) không có url (ảnh không được lưu – Q7B); cùng phiên thì ảnh vẫn còn trong bộ nhớ.
  const previewSrc = params.url || dataUrl;

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const res = await readAssetFile(file, params.role);
      if (!res.ok) return toast.error(res.message);
      setAssetData(res.patch.assetId, res.dataUrl);
      update<'product-asset'>(nodeId, res.patch);
    } finally {
      setBusy(false);
    }
  };

  const roleOptions = ASSET_ROLE_OPTIONS.filter((o) => (roles as readonly string[]).includes(o.value)) as {
    value: R; label: string;
  }[];

  return (
    <>
      {previewSrc && (
        // eslint-disable-next-line @next/next/no-img-element -- blob/data URL của file vừa chọn
        <img src={previewSrc} alt={params.fileName} className="block max-h-40 w-full rounded-lg border bg-muted object-contain p-3" />
      )}
      {params.fileName ? (
        <p className="text-xs text-muted-foreground">
          {params.fileName} · {params.originalDims.width}×{params.originalDims.height}
          {params.hasAlpha ? ' · có nền trong suốt' : ' · không có nền trong suốt'}
          {!hasData && ' · cần tải lại ảnh để chạy'}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Chưa có ảnh.</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = '';
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        <Upload className="size-4" aria-hidden />
        {params.fileName ? 'Đổi ảnh' : 'Tải ảnh lên'}
      </Button>
      {roleOptions.length > 1 && (
        <SelectField
          label="Vai trò"
          value={params.role}
          options={roleOptions}
          onChange={(role) => update<'product-asset'>(nodeId, { role } as Partial<FlowAsset<PixelAssetRole>>)}
        />
      )}
    </>
  );
}
