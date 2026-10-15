'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  guessHasAlpha, isAllowedAssetType, isWithinSizeLimit, loadImageDimensions, MAX_BYTES,
} from '@/lib/asset-upload';
import { ASSET_ROLE_OPTIONS } from '@/lib/types';
import type { FlowAsset, PixelAssetRole, ReferenceAssetRole } from '@/lib/flow/schema';
import { useFlowStore } from '@/store/flow-store';
import { SelectField } from './fields';

const ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp,.png,.jpg,.jpeg,.svg,.webp';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('read')));
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(file);
  });
}

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
  const hasData = useFlowStore((s) => Boolean(params.assetId && s.assetData[params.assetId]));

  const onFile = async (file: File) => {
    if (!isAllowedAssetType(file)) return toast.error(`${file.name}: định dạng không được hỗ trợ (PNG, JPG, SVG, WebP).`);
    if (!isWithinSizeLimit(file)) return toast.error(`${file.name}: dung lượng vượt quá ${MAX_BYTES / (1024 * 1024)}MB.`);
    setBusy(true);
    try {
      const url = URL.createObjectURL(file);
      const [originalDims, dataUrl] = await Promise.all([loadImageDimensions(url), fileToDataUrl(file)]);
      const assetId = crypto.randomUUID();
      setAssetData(assetId, dataUrl);
      update<'product-asset'>(nodeId, { assetId, url, fileName: file.name, hasAlpha: guessHasAlpha(file), originalDims });
    } catch {
      toast.error(`${file.name}: không đọc được ảnh.`);
    } finally {
      setBusy(false);
    }
  };

  const roleOptions = ASSET_ROLE_OPTIONS.filter((o) => (roles as readonly string[]).includes(o.value)) as {
    value: R; label: string;
  }[];

  return (
    <>
      {params.url && (
        // eslint-disable-next-line @next/next/no-img-element -- blob URL của file vừa chọn
        <img src={params.url} alt={params.fileName} className="block max-h-40 w-full rounded-lg border bg-muted object-contain" />
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
