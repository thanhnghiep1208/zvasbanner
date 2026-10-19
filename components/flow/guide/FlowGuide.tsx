import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowLeft, ArrowRight, ChevronDown, CircleAlert, ImagePlus, LayoutTemplate, Play, TriangleAlert, type LucideIcon } from 'lucide-react';
import { NODE_DEFINITIONS, PORT_TYPE_LABELS } from '@/lib/flow/node-definitions';
import type { NodeType, PortType } from '@/lib/flow/schema';
import { cn } from '@/lib/utils';
import { NodeIconChip } from '../nodes/FlowNodeCard';
import { COMMON_ISSUES, NEED, NEED_LABELS, RECIPES, TIPS, type Need, type Recipe } from './guide-content';

const TYPES = Object.keys(NODE_DEFINITIONS) as NodeType[];
const [COMPOSED, FLAT] = RECIPES;

/** Chấm màu theo kiểu port – cùng token với handle trên canvas. Chuỗi tĩnh để Tailwind quét được. */
const PORT_DOT: Record<PortType, string> = {
  product: 'bg-port-product',
  image: 'bg-port-image',
  brief: 'bg-port-brief',
  text: 'bg-port-text',
  brand: 'bg-port-brand',
  ratio: 'bg-port-ratio',
  style: 'bg-port-style',
  layout: 'bg-port-layout',
  background: 'bg-port-background',
  composition: 'bg-port-composition',
  raster: 'bg-port-raster',
};

/** Kiểu chip node theo mức cần thiết: đậm = bắt buộc, viền nét đứt = tuỳ chọn. */
const NEED_CHIP: Record<Need, string> = {
  required: 'border-border bg-card font-medium',
  recommended: 'border-border bg-card',
  optional: 'border-dashed border-border text-muted-foreground',
  none: 'hidden',
};

const NEED_DOT: Record<Need, string> = {
  required: 'bg-foreground',
  recommended: 'bg-run-done',
  optional: 'border border-muted-foreground bg-transparent',
  none: 'hidden',
};

const label = (t: NodeType) => NODE_DEFINITIONS[t].label;

function NeedDot({ need }: { need: Need }) {
  return <span className={cn('size-2 shrink-0 rounded-full', NEED_DOT[need])} aria-hidden />;
}

function NodeChip({ type, need }: { type: NodeType; need: Need }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-lg border py-1 pr-2.5 pl-1 text-sm', NEED_CHIP[need])}
      title={NEED_LABELS[need]}
    >
      <NodeIconChip type={type} size="sm" />
      {label(type)}
      <NeedDot need={need} />
      <span className="sr-only">({NEED_LABELS[need]})</span>
    </span>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Chú thích">
      {(['required', 'recommended', 'optional'] as const).map((n) => (
        <li key={n} className="inline-flex items-center gap-1.5"><NeedDot need={n} />{NEED_LABELS[n]}</li>
      ))}
    </ul>
  );
}

function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group mt-3">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
        {summary}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

function EdgeList({ recipe }: { recipe: Recipe }) {
  return (
    <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
      {recipe.edges.map((e) => {
        const type = NODE_DEFINITIONS[e.to].inputs.find((p) => p.id === e.port)!.type;
        return (
          <li key={`${e.from}-${e.to}-${e.port}`} className="flex items-center gap-2">
            <span className={cn('size-2 shrink-0 rounded-full', PORT_DOT[type])} aria-hidden />
            <span className={e.required ? 'font-medium' : 'text-muted-foreground'}>
              {label(e.from)} → {label(e.to)}
            </span>
            {e.required && <span className="sr-only">(bắt buộc)</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** Sơ đồ các bước: ngang trên màn rộng, dọc trên điện thoại. */
function StageFlow({ recipe }: { recipe: Recipe }) {
  return (
    <ol className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
      {recipe.stages.map((s, i) => (
        <li key={s.title} className="contents">
          {i > 0 && (
            <span className="flex justify-center text-muted-foreground lg:items-center" aria-hidden>
              <ArrowDown className="size-4 lg:hidden" />
              <ArrowRight className="hidden size-4 lg:block" />
            </span>
          )}
          <div className={cn('rounded-xl border bg-muted/30 p-3', i === 0 ? 'lg:flex-[2.2]' : 'lg:flex-1')}>
            <p className="flex items-baseline gap-2">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background">{i + 1}</span>
              <span className="font-semibold">{s.title}</span>
            </p>
            <p className="mt-0.5 mb-2.5 pl-7 text-xs text-muted-foreground">{s.hint}</p>
            <div className="flex flex-wrap gap-1.5">
              {s.nodes.map((t) => <NodeChip key={t} type={t} need={NEED[t][recipe.id]} />)}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function TemplateLink({ recipe }: { recipe: Recipe }) {
  return (
    <Link
      href={`/flow?template=${recipe.templateId}`}
      className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      Mở mẫu “{recipe.templateName}”
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

function NodeCard({ type }: { type: NodeType }) {
  const def = NODE_DEFINITIONS[type];
  const { connect, tips } = TIPS[type];
  const flatOnly = NEED[type].composed === 'none';
  const need = NEED[type].composed;
  return (
    <article id={`node-${type}`} className="scroll-mt-20 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <NodeIconChip type={type} />
        <h3 className="min-w-0 flex-1 font-semibold">{def.label}</h3>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          {flatOnly ? 'Chỉ cho Flat' : <><NeedDot need={need} />{NEED_LABELS[need]}</>}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{def.description}</p>
      <ul className="mt-2 space-y-0.5 text-sm">
        {tips.map((t) => <li key={t}>{t}</li>)}
      </ul>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2.5 text-xs text-muted-foreground">
        <span>Nối vào: <span className="text-foreground">{connect}</span></span>
        {def.aiCallsPerRatio > 0 && <span>{def.aiCallsPerRatio} lượt AI / kích thước</span>}
      </p>
    </article>
  );
}

/** 3 bước cho người mới: không cần biết node, chỉ dùng chế độ Đơn giản. */
const QUICK_STEPS: { icon: LucideIcon; title: string; body: ReactNode }[] = [
  {
    icon: LayoutTemplate,
    title: 'Chọn template',
    body: <>Bấm tên template ở góc trên trái canvas, chọn mẫu gần với banner bạn cần.</>,
  },
  {
    icon: ImagePlus,
    title: 'Điền ảnh và chữ',
    body: <>Ở chế độ <b className="font-medium text-foreground">Đơn giản</b>: tải ảnh sản phẩm, sửa tiêu đề. Tab <b className="font-medium text-foreground">Xem trước bố cục</b> hiện ngay, không tốn lượt AI.</>,
  },
  {
    icon: Play,
    title: 'Bấm Chạy',
    body: <>Bấm <b className="font-medium text-foreground">Chạy tất cả</b> ở góc trên phải. Xong thì bấm <b className="font-medium text-foreground">Tải tất cả</b> ở tab Kết quả.</>,
  },
];

function QuickStart() {
  return (
    <section aria-labelledby="quick">
      <h1 id="quick" className="text-2xl font-semibold tracking-tight">Bắt đầu nhanh</h1>
      <p className="mt-1.5 text-muted-foreground">Không cần biết node: 3 bước là có banner.</p>
      <ol className="mt-5 grid gap-3 sm:grid-cols-3">
        {QUICK_STEPS.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="relative rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <p className="font-semibold"><span className="text-muted-foreground tabular-nums">{i + 1}.</span> {title}</p>
            </div>
            <p className="mt-2.5 text-sm text-muted-foreground">{body}</p>
          </li>
        ))}
      </ol>
      <Link
        href={`/flow?template=${COMPOSED.templateId}`}
        className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        Thử ngay với mẫu “{COMPOSED.templateName}”
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}

export function FlowGuide() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-[52px] max-w-5xl items-center gap-3 px-4">
          <Link href="/flow" className="inline-flex items-center gap-1.5 text-sm font-medium hover:opacity-80">
            <ArrowLeft className="size-4" aria-hidden />
            Về Flow canvas
          </Link>
          <span className="h-5 w-px bg-border" aria-hidden />
          <span className="truncate text-sm text-muted-foreground">Hướng dẫn</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-12 px-4 py-8 sm:py-10">
        <QuickStart />

        {/* Flow chuẩn trên canvas */}
        <section aria-labelledby="flow" className="border-t pt-10">
          <h2 id="flow" className="text-lg font-semibold">Muốn chỉnh sâu: flow trên canvas</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bấm <b className="font-medium text-foreground">Canvas</b> trên header để thấy toàn bộ node. Một flow nối từ trái sang phải theo 4 bước.
          </p>

          <div className="mt-6 rounded-2xl border bg-card p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className="text-sm">
                <span className="font-semibold">{COMPOSED.title}</span>
                <span className="text-muted-foreground"> · mặc định · {COMPOSED.aiCalls}</span>
              </p>
              <Legend />
            </div>
            <StageFlow recipe={COMPOSED} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">{COMPOSED.summary}</p>
              <TemplateLink recipe={COMPOSED} />
            </div>
            <Disclosure summary="Xem các dây cần nối">
              <EdgeList recipe={COMPOSED} />
            </Disclosure>
          </div>

          <div className="mt-4 rounded-2xl border border-dashed p-4 sm:p-5">
            <p className="text-sm">
              <span className="font-semibold">Cách khác: {FLAT.title}</span>
              <span className="text-muted-foreground"> · {FLAT.aiCalls}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {FLAT.summary} Thay 3 node Auto layout, Tạo nền, Ghép layer bằng 1 node{' '}
              <span className="font-medium text-foreground">{label('generate-flat')}</span>.
            </p>
            <div className="mt-2"><TemplateLink recipe={FLAT} /></div>
            <Disclosure summary="Xem các dây cần nối">
              <EdgeList recipe={FLAT} />
            </Disclosure>
          </div>
        </section>

        {/* 2. Từng node */}
        <section aria-labelledby="nodes">
          <h2 id="nodes" className="text-lg font-semibold">Các node</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TYPES.map((t) => <NodeCard key={t} type={t} />)}
          </div>
        </section>

        {/* 3. Nối dây + lỗi */}
        <div className="grid gap-8 lg:grid-cols-2">
          <section aria-labelledby="rules">
            <h2 id="rules" className="text-lg font-semibold">Nối dây</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>Chỉ nối được 2 ô <span className="font-medium">cùng màu</span>. Khi kéo dây, ô nối được sẽ sáng lên.</li>
              <li>Ảnh, Text, Ảnh tham chiếu nối được nhiều dây; ô khác chỉ 1 dây.</li>
              <li>Mỗi flow có đúng 1 <span className="font-medium">Xuất ảnh</span>.</li>
            </ul>
            <Disclosure summary="Bảng màu ô nối">
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                {(Object.keys(PORT_TYPE_LABELS) as PortType[]).map((t) => (
                  <li key={t} className="inline-flex items-center gap-1.5">
                    <span className={cn('size-2 rounded-full', PORT_DOT[t])} aria-hidden />{PORT_TYPE_LABELS[t]}
                  </li>
                ))}
              </ul>
            </Disclosure>
          </section>

          <section aria-labelledby="issues">
            <h2 id="issues" className="text-lg font-semibold">Lỗi hay gặp</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {COMMON_ISSUES.map((i) => (
                <li key={i.title} className="flex gap-2">
                  {i.severity === 'error'
                    ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Lỗi" />
                    : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-run-stale" aria-label="Cảnh báo" />}
                  <span><span className="font-medium">{i.title}:</span> <span className="text-muted-foreground">{i.fix}</span></span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* 4. Phím tắt */}
        <section aria-labelledby="keys" className="border-t pt-6 pb-4">
          <h2 id="keys" className="sr-only">Phím tắt</h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {[
              ['⌘/Ctrl+Z', 'Hoàn tác'],
              ['⇧⌘Z / Ctrl+Y', 'Làm lại'],
              ['⌘/Ctrl+S', 'Lưu'],
              ['Kéo ảnh vào canvas', 'Tạo node ảnh'],
            ].map(([k, v]) => (
              <li key={k}>
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-xs text-foreground">{k}</kbd> {v}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
