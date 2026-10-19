'use client';

import { useState } from 'react';
import { LoaderCircle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { INTENT_OPTIONS } from '@/components/prompt/MarketingBriefChips';
import { BRIEF_TONES, BRIEF_TONE_LABELS, EMPTY_CAMPAIGN, type BriefTone, type CampaignBrief } from '@/lib/flow/brief';
import { canSuggestCopy, type CopyVariant } from '@/lib/flow/copy-suggest';
import type { FlowNode, NodeParamsMap } from '@/lib/flow/schema';
import { applyCopy } from '@/lib/flow/text-nodes';
import { useFlowStore } from '@/store/flow-store';
import { SelectField, TextAreaField, TextField, ToggleGroupField } from './fields';

type BriefParams = NodeParamsMap['brief'];

const NONE = '__none__';
const TONE_OPTIONS = [{ value: NONE, label: 'Không chọn' }, ...BRIEF_TONES.map((t) => ({ value: t, label: BRIEF_TONE_LABELS[t] }))];
const ROLE_LABELS = { headline: 'tiêu đề', subheadline: 'mô tả ngắn', cta: 'CTA' } as const;

/**
 * Brief marketing (brief.ts): mục đích, đối tượng, thông điệp, ưu đãi, tone + "Gợi ý chữ từ brief".
 * Dùng chung cho Inspector (node Brief) và Simple view. Ghi thẳng vào params node Brief.
 */
export function CampaignBriefFields({ nodeId }: { nodeId: string }) {
  const node = useFlowStore((s) => s.graph.nodes.find((n) => n.id === nodeId)) as FlowNode<'brief'> | undefined;
  const update = useFlowStore((s) => s.updateNodeParams);
  if (!node) return null;
  const p = node.params;
  const c = p.campaign ?? EMPTY_CAMPAIGN;
  const setCampaign = (patch: Partial<CampaignBrief>) => update<'brief'>(nodeId, { campaign: { ...c, ...patch } });

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroupField label="Mục đích chiến dịch" values={p.marketingBrief.campaignIntents} options={INTENT_OPTIONS}
        onChange={(campaignIntents) => update<'brief'>(nodeId, { marketingBrief: { ...p.marketingBrief, campaignIntents } })} />
      <TextField label="Đối tượng khách hàng" value={c.audience} placeholder="VD: nữ 25–35, dân văn phòng, quan tâm skincare"
        onChange={(audience) => setCampaign({ audience })} />
      <TextAreaField label="Thông điệp / giá trị chính" value={c.message} rows={2}
        placeholder="VD: da sáng mịn sau 7 ngày, thành phần thiên nhiên an toàn"
        onChange={(message) => setCampaign({ message })} />
      <TextField label="Ưu đãi" value={c.offer} placeholder="VD: giảm 30% + freeship đến 20/11"
        onChange={(offer) => setCampaign({ offer })} />
      <SelectField label="Tone giọng" value={c.tone ?? NONE} options={TONE_OPTIONS}
        onChange={(v) => setCampaign({ tone: v === NONE ? undefined : (v as BriefTone) })} />
      <SuggestCopy p={p} />
    </div>
  );
}

function SuggestCopy({ p }: { p: BriefParams }) {
  const editGraph = useFlowStore((s) => s.editGraph);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variants, setVariants] = useState<CopyVariant[] | null>(null);
  const ready = canSuggestCopy(p.campaign);

  const suggest = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/flow/suggest-copy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ campaign: p.campaign, intents: p.marketingBrief.campaignIntents, scene: p.prompt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(typeof data.error === 'string' ? data.error : 'Không gợi ý được chữ lúc này.');
      const list = Array.isArray(data.variants) ? (data.variants as CopyVariant[]) : [];
      if (!list.length) return setError('AI không trả gợi ý hợp lệ. Thử lại.');
      setVariants(list);
    } catch {
      setError('Không kết nối được máy chủ.');
    } finally {
      setBusy(false);
    }
  };

  const use = (v: CopyVariant) => {
    let added: string[] = [];
    editGraph((g) => {
      const r = applyCopy(g, v);
      added = r.added.map((role) => ROLE_LABELS[role]);
      return r.graph;
    });
    toast.success(added.length ? `Đã điền chữ, thêm node Text cho ${added.join(', ')}.` : 'Đã điền chữ vào các node Text.');
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
      <Button type="button" size="sm" variant="outline" className="self-start" disabled={!ready || busy} aria-busy={busy} onClick={() => void suggest()}>
        {busy ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles aria-hidden />}
        {busy ? 'Đang viết…' : variants ? 'Gợi ý lại' : 'Gợi ý chữ từ brief'}
      </Button>
      <p className="text-xs text-muted-foreground">
        {ready ? 'AI viết 3 phương án tiêu đề, mô tả ngắn, CTA theo brief. Không tốn lượt tạo ảnh.' : 'Điền thông điệp chính hoặc ưu đãi để AI gợi ý tiêu đề, mô tả, CTA.'}
      </p>
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      {variants && (
        <ul className="flex flex-col gap-1.5" aria-label="Phương án chữ">
          {variants.map((v, i) => (
            <li key={i} className="flex flex-col gap-1 rounded-md border bg-background p-2.5">
              <p className="text-sm leading-snug font-semibold">{v.headline}</p>
              {v.subheadline && <p className="text-xs text-muted-foreground">{v.subheadline}</p>}
              <div className="mt-0.5 flex items-center justify-between gap-2">
                {v.cta ? <span className="rounded-md bg-foreground px-2 py-0.5 text-[11px] font-medium text-background">{v.cta}</span> : <span />}
                <Button type="button" size="xs" onClick={() => use(v)} aria-label={`Dùng phương án ${i + 1}`}>Dùng</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
