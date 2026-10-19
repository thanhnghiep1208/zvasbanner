'use client';

import { useMemo, useState } from 'react';
import { CircleAlert, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { NodeParamsMap } from '@/lib/flow/schema';
import { resolveExposed, type ExposedParam } from '@/lib/flow/template/template';
import { validateGraph } from '@/lib/flow/validate';
import { canvasMeasurer } from '@/lib/flow-ui/compose-render';
import { useFlowStore } from '@/store/flow-store';
import { RunResults } from '../inspector/RunResults';
import { CampaignBriefFields } from '../inspector/CampaignBriefFields';
import { ExposedField } from './ExposedField';
import { ImageListField } from './ImageListField';
import { LayoutPreview } from './LayoutPreview';
import { TextStyleModeField } from './TextStyleModeField';
import { isImageNode } from '@/lib/flow/image-nodes';

const DEFAULT_GROUP = 'Thiết lập';
/** Nhóm template đặt field màu/kiểu (defaults.ts `G.look`) – đặt lựa chọn Kiểu chữ ở đầu nhóm này. */
const LOOK_GROUP = 'Phong cách';

/**
 * Simple view (T5.2, SPEC 5.7): form sinh từ `exposed` của template, ghi thẳng vào graph.
 * Cùng graph với Canvas view – "Mở canvas" chỉ đổi cách hiển thị, không copy dữ liệu.
 */
export function SimpleView({ onOpenCanvas }: { onOpenCanvas: () => void }) {
  const graph = useFlowStore((s) => s.graph);
  const exposed = useFlowStore((s) => s.exposed);
  const runInfo = useFlowStore((s) => s.runInfo);
  // Field ảnh: chỉ field ảnh đầu tiên được vẽ, thành danh sách mọi ảnh trong graph (ImageListField).
  // Node Brief: khối "Brief" riêng (CampaignBriefFields) ở đầu form, đã gồm mục đích chiến dịch.
  const briefNodeId = graph.nodes.find((n) => n.type === 'brief')?.id;
  const fields = useMemo(() => {
    const all = resolveExposed(graph, exposed).filter((f) => !(f.nodeId === briefNodeId && f.path.join('.') === 'marketingBrief.campaignIntents'));
    const firstAsset = all.find((f) => f.control === 'asset');
    return all.filter((f) => f.control !== 'asset' || f === firstAsset);
  }, [graph, exposed, briefNodeId]);
  const hidden = exposed.length - resolveExposed(graph, exposed).length;

  const groups = useMemo(() => {
    const map = new Map<string, ExposedParam[]>();
    for (const f of fields) map.set(f.group ?? DEFAULT_GROUP, [...(map.get(f.group ?? DEFAULT_GROUP) ?? []), f]);
    return [...map];
  }, [fields]);

  // Lỗi/cảnh báo theo node → hiện dưới field của node đó; lỗi node không lộ ra → khối chung.
  const issues = useMemo(() => validateGraph(graph, { measurer: canvasMeasurer }), [graph]);
  const hasImageList = fields.some((f) => f.control === 'asset');
  const shownNodes = new Set([
    ...fields.map((f) => f.nodeId),
    ...(hasImageList ? graph.nodes.filter(isImageNode).map((n) => n.id) : []),
  ]);
  const otherIssues = issues.filter((i) => i.severity === 'error' && (!i.nodeId || !shownNodes.has(i.nodeId)));
  const fieldMessages = (nodeId: string) => [
    ...issues.filter((i) => i.nodeId === nodeId).map((i) => ({ severity: i.severity, message: i.message })),
    ...(runInfo[nodeId]?.state === 'error' && runInfo[nodeId]?.message
      ? [{ severity: 'error' as const, message: runInfo[nodeId]!.message! }] : []),
  ];
  // Mỗi node chỉ báo 1 lần, dưới field đầu tiên của node đó.
  const firstFieldOfNode = new Map<string, string>();
  for (const f of fields) if (!firstFieldOfNode.has(f.nodeId)) firstFieldOfNode.set(f.nodeId, f.id);

  const exportNode = graph.nodes.find((n) => n.type === 'export');
  const results = useFlowStore((s) => s.results);
  // Tab user chọn chỉ giữ cho lần chạy hiện tại; chạy xong lần mới → tự về Kết quả. Chưa có kết quả → xem trước.
  const [picked, setPicked] = useState<{ tab: 'preview' | 'results'; results: typeof results } | null>(null);
  const shownTab = picked?.results === results ? picked.tab : results.length ? 'results' : 'preview';
  const setTab = (tab: 'preview' | 'results') => setPicked({ tab, results });

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:overflow-hidden">
      <section className="flex min-h-0 flex-col border-r bg-card lg:overflow-y-auto" aria-label="Thiết lập banner">
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div>
            <h2 className="text-sm font-semibold">Thiết lập banner</h2>
            <p className="text-xs text-muted-foreground">Điền các mục dưới đây rồi bấm “Chạy tất cả”.</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={onOpenCanvas}>
            <Workflow aria-hidden />
            Mở canvas
          </Button>
        </div>

        <div className="flex flex-col gap-6 p-4">
          {briefNodeId && (
            <section className="flex flex-col gap-4" aria-labelledby="grp-brief">
              <div>
                <h3 id="grp-brief" className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Brief</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Banner nói gì, với ai. AI dựa vào đây để chọn không khí nền và gợi ý chữ.</p>
              </div>
              <CampaignBriefFields nodeId={briefNodeId} />
            </section>
          )}
          {groups.map(([group, items]) => (
            <section key={group} className="flex flex-col gap-4" aria-labelledby={`grp-${group}`}>
              <h3 id={`grp-${group}`} className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{group}</h3>
              {group === LOOK_GROUP && <TextStyleModeField />}
              {items.map((f) => (
                <div key={f.id} className="flex flex-col gap-1.5">
                  {f.control === 'asset'
                    ? <ImageListField requiredNodeId={f.nodeId} label={f.required ? `${f.label} *` : f.label} hint={f.hint} messagesFor={fieldMessages} />
                    : <ExposedField e={f} />}
                  {f.control !== 'asset' && firstFieldOfNode.get(f.nodeId) === f.id && fieldMessages(f.nodeId).map((m, k) => (
                    <p key={k} className={m.severity === 'error' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                      {m.message}
                    </p>
                  ))}
                </div>
              ))}
            </section>
          ))}

          {!groups.some(([g]) => g === LOOK_GROUP) && (
            <section className="flex flex-col gap-4" aria-label="Kiểu chữ">
              <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{LOOK_GROUP}</h3>
              <TextStyleModeField />
            </section>
          )}

          {otherIssues.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-lg bg-destructive/10 p-3 text-xs text-destructive" role="alert">
              <p className="flex items-center gap-1.5 font-medium"><CircleAlert className="size-3.5" aria-hidden />Cần sửa trong canvas</p>
              {otherIssues.map((i, k) => <p key={k}>{i.message}</p>)}
            </div>
          )}
          {hidden > 0 && (
            <p className="text-xs text-muted-foreground">{hidden} mục không còn hiện vì node đã bị xoá ở canvas.</p>
          )}
        </div>
      </section>

      <section className="flex min-h-0 flex-col bg-muted/40 lg:overflow-y-auto" aria-label="Kết quả">
        <div className="flex flex-col gap-3 p-4">
          <div className="inline-flex w-fit rounded-lg border bg-muted p-0.5 text-xs" role="tablist" aria-label="Xem">
            {([['preview', 'Xem trước bố cục'], ['results', 'Kết quả']] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={shownTab === v}
                onClick={() => setTab(v)}
                className="rounded-md px-2.5 py-1 font-medium text-muted-foreground transition-colors aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-xs focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {label}
              </button>
            ))}
          </div>
          {shownTab === 'preview' ? <LayoutPreview /> : exportNode
            ? <RunResults exportParams={exportNode.params as NodeParamsMap['export']} />
            : <p className="text-xs text-muted-foreground">Template chưa có node Xuất ảnh.</p>}
        </div>
      </section>
    </div>
  );
}
