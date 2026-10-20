'use client';

import { useMemo, useState } from 'react';
import { CircleAlert, Workflow } from 'lucide-react';
import type { NodeParamsMap } from '@/lib/flow/schema';
import { resolveExposed, type ExposedParam } from '@/lib/flow/template/template';
import { validateGraph } from '@/lib/flow/validate';
import { useFlowStore } from '@/store/flow-store';
import { RunResults } from '../inspector/RunResults';
import { CampaignBriefFields } from '../inspector/CampaignBriefFields';
import { ExposedField } from './ExposedField';
import { ImageListField } from './ImageListField';
import { StepSection } from './StepSection';
import { BRIEF_STEP, missingCount, orderSteps, stepSummary } from '@/lib/flow-ui/simple-steps';
import { isImageNode } from '@/lib/flow/image-nodes';

const DEFAULT_GROUP = 'Thiết lập';

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

  // Bước = nhóm field của template (+ bước Brief: field của node Brief, vd. bối cảnh nền, gom về đây).
  const stepFields = useMemo(() => {
    const map = new Map<string, ExposedParam[]>();
    if (briefNodeId) map.set(BRIEF_STEP, []);
    for (const f of fields) {
      const g = f.nodeId === briefNodeId ? BRIEF_STEP : f.group ?? DEFAULT_GROUP;
      map.set(g, [...(map.get(g) ?? []), f]);
    }
    return map;
  }, [fields, briefNodeId]);
  const steps = orderSteps([...stepFields.keys()]);

  // Mở sẵn 2 bước đầu (ảnh, chữ – user gần như luôn phải sửa) + bước còn thiếu mục bắt buộc; còn lại gập. Đổi template thì tính lại.
  const templateId = useFlowStore((s) => s.templateId);
  const [openState, setOpenState] = useState<{ key: string | null; open: Set<string> } | null>(null);
  const initialOpen = () => {
    const missing = steps.filter((st) => missingCount(graph, stepFields.get(st) ?? []) > 0);
    return new Set([...steps.filter((st) => st !== BRIEF_STEP).slice(0, 2), ...missing]);
  };
  const openSet = openState?.key === templateId ? openState.open : initialOpen();
  const isOpen = (step: string) => openSet.has(step);
  const toggle = (step: string, o: boolean) => {
    const next = new Set(openSet);
    if (o) next.add(step); else next.delete(step);
    setOpenState({ key: templateId, open: next });
  };

  // Lỗi/cảnh báo theo node → hiện dưới field của node đó; lỗi node không lộ ra → khối chung.
  const issues = useMemo(() => validateGraph(graph), [graph]);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:overflow-hidden">
      <section className="flex shrink-0 flex-col border-b bg-card lg:min-h-0 lg:shrink lg:border-r lg:border-b-0 lg:overflow-y-auto" aria-label="Thiết lập banner">
        <div>
          {steps.map((step, i) => {
            const items = stepFields.get(step) ?? [];
            const isBrief = step === BRIEF_STEP;
            return (
              <StepSection
                key={step}
                index={i + 1}
                title={step}
                optional={isBrief}
                summary={stepSummary(graph, step, items, briefNodeId)}
                missing={missingCount(graph, items)}
                open={isOpen(step)}
                onToggle={(o) => toggle(step, o)}
              >
                {isBrief && briefNodeId && (
                  <>
                    <p className="-mt-1 text-xs text-muted-foreground">Banner nói gì, với ai. AI dựa vào đây để vẽ banner và gợi ý chữ.</p>
                    <CampaignBriefFields nodeId={briefNodeId} />
                  </>
                )}
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
              </StepSection>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 p-4">
          {otherIssues.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-lg bg-destructive/10 p-3 text-xs text-destructive" role="alert">
              <p className="flex items-center gap-1.5 font-medium"><CircleAlert className="size-3.5" aria-hidden />Cần sửa trong canvas</p>
              {otherIssues.map((i, k) => <p key={k}>{i.message}</p>)}
            </div>
          )}
          {hidden > 0 && (
            <p className="text-xs text-muted-foreground">{hidden} mục không còn hiện vì node đã bị xoá ở canvas.</p>
          )}
          <button type="button" onClick={onOpenCanvas}
            className="inline-flex items-center gap-1.5 self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <Workflow className="size-3.5" aria-hidden />
            Chỉnh sâu hơn trong Canvas
          </button>
        </div>
      </section>

      <section className="flex shrink-0 flex-col bg-muted/40 lg:min-h-0 lg:shrink lg:overflow-y-auto" aria-label="Kết quả">
        <div className="flex flex-col gap-3 p-4">
          {exportNode
            ? <RunResults exportParams={exportNode.params as NodeParamsMap['export']} />
            : <p className="text-xs text-muted-foreground">Template chưa có node Xuất ảnh.</p>}
        </div>
      </section>
    </div>
  );
}
