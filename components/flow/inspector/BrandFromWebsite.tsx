'use client';

import { useState, type FormEvent } from 'react';
import { Check, Globe, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BrandFromUrlResult } from '@/lib/flow-server/brand-fetch';
import { placeLogo } from '@/lib/flow/image-nodes';
import type { NodeParamsMap } from '@/lib/flow/schema';
import { FLOW_FONTS } from '@/lib/flow/text/text-style';
import { cn } from '@/lib/utils';
import { useFlowStore } from '@/store/flow-store';
import { readAssetFile } from './read-asset-file';

type BrandParams = NodeParamsMap['brand-kit'];

/** Giải mã data URL base64 thành File. Không dùng fetch(dataUrl): CSP connect-src của app chặn `data:`. */
function dataUrlToFile(dataUrl: string, name: string): File {
  const [head, b64 = ''] = dataUrl.split(',', 2);
  const type = head!.match(/^data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type });
}

/**
 * "Lấy từ website" trong Brand kit: server đọc HTML/CSS/JS của trang (không dùng AI) → gợi ý màu, font, logo.
 * User xem trước, bỏ chọn cái không đúng rồi mới áp dụng. Logo thành node Asset loại Logo (ảnh không lưu server).
 */
export function BrandFromWebsite({ nodeId, p }: { nodeId: string; p: BrandParams }) {
  const update = useFlowStore((s) => s.updateNodeParams);
  const editGraph = useFlowStore((s) => s.editGraph);
  const setAssetData = useFlowStore((s) => s.setAssetData);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BrandFromUrlResult | null>(null);
  const [colors, setColors] = useState<Set<string>>(new Set());
  const [useFont, setUseFont] = useState(true);
  const [logoIdx, setLogoIdx] = useState<number | null>(0);

  const fetchBrand = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/flow/brand-from-url', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(typeof data.error === 'string' ? data.error : 'Không lấy được thông tin từ website này.');
      const r = data as BrandFromUrlResult;
      setResult(r);
      setColors(new Set(r.colors));
      setUseFont(Boolean(r.fontId));
      setLogoIdx(r.logos.length ? 0 : null);
    } catch {
      setError('Không kết nối được máy chủ.');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!result) return;
    const picked = result.colors.filter((c) => colors.has(c));
    const patch: Partial<BrandParams> = {};
    if (picked.length) patch.colors = picked;
    if (useFont && result.fontId) patch.fontPreference = FLOW_FONTS[result.fontId].label;
    if (Object.keys(patch).length) update<'brand-kit'>(nodeId, patch);

    const logo = logoIdx === null ? undefined : result.logos[logoIdx];
    if (logo) try {
      const file = dataUrlToFile(logo.dataUrl, logo.fileName);
      const read = await readAssetFile(file, 'logo');
      if (!read.ok) {
        toast.error(read.message);
      } else {
        setAssetData(read.patch.assetId, read.dataUrl);
        editGraph((g) => placeLogo(g, read.patch).graph);
      }
    } catch {
      toast.error('Không đọc được ảnh logo.');
    }
    const parts = [picked.length && `${picked.length} màu`, patch.fontPreference && `font ${patch.fontPreference}`, logo && 'logo'].filter(Boolean);
    toast.success(parts.length ? `Đã áp dụng ${parts.join(', ')} từ ${result.name ?? 'website'}.` : 'Chưa chọn gì để áp dụng.');
    if (parts.length) setResult(null);
  };

  return (
    <section className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3" aria-label="Lấy brand từ website">
      <form onSubmit={fetchBrand} className="flex flex-col gap-1.5">
        <label htmlFor={`brand-url-${nodeId}`} className="text-xs font-medium">Lấy từ website</label>
        <div className="flex gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Globe className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id={`brand-url-${nodeId}`} type="text" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="vd. thuonghieu.vn" className="h-8 pl-8" autoComplete="url" />
          </div>
          <Button type="submit" size="sm" disabled={busy || !url.trim()} aria-busy={busy}>
            {busy ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {busy ? 'Đang lấy…' : 'Lấy'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Tự lấy màu, font và logo. Không tốn lượt AI – kiểm lại trước khi áp dụng.</p>
      </form>

      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}

      {result && (
        <div className="flex flex-col gap-3 border-t pt-3" aria-live="polite">
          {result.name && <p className="text-sm font-medium">{result.name}</p>}

          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="mb-1 p-0 text-xs text-muted-foreground">Màu (bấm để bỏ chọn)</legend>
            {result.colors.length ? (
              <div className="flex flex-wrap gap-1.5">
                {result.colors.map((c) => {
                  const on = colors.has(c);
                  return (
                    <button key={c} type="button" aria-pressed={on}
                      onClick={() => setColors((s) => { const n = new Set(s); if (on) n.delete(c); else n.add(c); return n; })}
                      className={cn('inline-flex items-center gap-1.5 rounded-md border bg-background py-1 pr-2 pl-1 font-mono text-xs transition-opacity focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none', !on && 'opacity-45')}>
                      <span className="grid size-5 place-items-center rounded border" style={{ background: c }} aria-hidden>
                        {on && <Check className="size-3 text-white mix-blend-difference" />}
                      </span>
                      {c}
                    </button>
                  );
                })}
              </div>
            ) : <p className="text-xs text-muted-foreground">Không tìm thấy màu thương hiệu rõ ràng.</p>}
          </fieldset>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Font</span>
            {result.fontId ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={useFont} onChange={(e) => setUseFont(e.target.checked)} className="size-4 accent-primary" />
                {FLOW_FONTS[result.fontId].label}
              </label>
            ) : (
              <p className="text-xs text-muted-foreground">
                {result.fontFamily ? `Trang dùng ${result.fontFamily} – canvas chưa có font này, giữ font hiện tại.` : 'Không tìm thấy font riêng.'}
              </p>
            )}
          </div>

          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="mb-1 p-0 text-xs text-muted-foreground">Logo</legend>
            {result.logos.length ? (
              <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Chọn logo">
                <div className="grid grid-cols-2 gap-1.5">
                  {result.logos.map((l, i) => (
                    <button key={l.url} type="button" role="radio" aria-checked={logoIdx === i} title={l.fileName}
                      onClick={() => setLogoIdx(i)}
                      className="flex h-16 min-w-0 items-center justify-center overflow-hidden rounded-md border bg-muted/60 px-2 transition-colors hover:bg-muted aria-checked:border-primary aria-checked:bg-background aria-checked:ring-2 aria-checked:ring-primary/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                      {/* eslint-disable-next-line @next/next/no-img-element -- data URL server vừa tải */}
                      <img src={l.dataUrl} alt={`Logo ${i + 1}: ${l.fileName}`}
                        // Viền bóng mảnh để logo trắng vẫn thấy trên nền sáng; icon nhỏ (favicon 16px) phóng lên tối thiểu 32px.
                        className="h-auto max-h-11 min-h-8 w-auto max-w-full object-contain [filter:drop-shadow(0_0_1px_rgb(0_0_0/0.55))]" />
                    </button>
                  ))}
                </div>
                <button type="button" role="radio" aria-checked={logoIdx === null} onClick={() => setLogoIdx(null)}
                  className="group inline-flex items-center gap-2 self-start rounded-md py-0.5 text-xs text-muted-foreground aria-checked:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                  <span className="grid size-3.5 place-items-center rounded-full border border-muted-foreground group-aria-checked:border-primary" aria-hidden>
                    <span className="size-1.5 rounded-full bg-primary opacity-0 group-aria-checked:opacity-100" />
                  </span>
                  Không lấy logo
                </button>
              </div>
            ) : <p className="text-xs text-muted-foreground">Không tìm thấy logo.</p>}
          </fieldset>

          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void apply()}>Áp dụng</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setResult(null)}>Huỷ</Button>
          </div>
          {p.colors.length > 0 && colors.size > 0 && (
            <p className="text-xs text-muted-foreground">Áp dụng sẽ thay {p.colors.length} màu hiện có bằng màu đã chọn.</p>
          )}
        </div>
      )}
    </section>
  );
}
