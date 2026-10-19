import Link from 'next/link';
import { ArrowLeft, ArrowRight, CircleAlert, Keyboard, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { NODE_DEFINITIONS, PORT_TYPE_LABELS, type NodeKind } from '@/lib/flow/node-definitions';
import type { NodeType, PortType } from '@/lib/flow/schema';
import { cn } from '@/lib/utils';
import { KIND_LABELS } from '../flow-styles';
import { NodeIconChip } from '../nodes/FlowNodeCard';
import { COMMON_ISSUES, NEED, NEED_LABELS, RECIPES, TIPS, type Need, type Recipe } from './guide-content';

const KINDS: NodeKind[] = ['input', 'config', 'layout', 'executor', 'output'];
const TYPES = Object.keys(NODE_DEFINITIONS) as NodeType[];

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

const NEED_BADGE: Record<Need, string> = {
  required: 'bg-primary text-primary-foreground',
  recommended: 'bg-run-done/15 text-run-done',
  optional: 'bg-muted text-muted-foreground',
  none: 'border-dashed border-border text-muted-foreground/70',
};

const label = (t: NodeType) => NODE_DEFINITIONS[t].label;

function NeedBadge({ need }: { need: Need }) {
  return <Badge variant="outline" className={cn('font-medium', NEED_BADGE[need])}>{NEED_LABELS[need]}</Badge>;
}

function PortChip({ type, required }: { type: PortType; required?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-1.5 py-0.5 text-xs">
      <span className={cn('size-2 rounded-full', PORT_DOT[type])} aria-hidden />
      {PORT_TYPE_LABELS[type]}
      {required !== undefined && (
        <span className={required ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
          {required ? '· bắt buộc' : '· tuỳ chọn'}
        </span>
      )}
    </span>
  );
}

function NodeName({ type }: { type: NodeType }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium">
      <NodeIconChip type={type} size="sm" />
      {label(type)}
    </span>
  );
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  const need = (t: NodeType) => NEED[t][recipe.id];
  const byNeed = (n: Need) => TYPES.filter((t) => need(t) === n);
  return (
    <article className="flex flex-col rounded-xl border bg-card p-5" aria-labelledby={`recipe-${recipe.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`recipe-${recipe.id}`} className="text-base font-semibold">{recipe.title}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{recipe.aiCalls}</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{recipe.summary}</p>

      <dl className="mt-4 space-y-3 text-sm">
        {(['required', 'recommended', 'optional'] as const).map((n) => (
          <div key={n} className="grid gap-1.5 sm:grid-cols-[96px_1fr]">
            <dt><NeedBadge need={n} /></dt>
            <dd className="flex flex-wrap gap-x-3 gap-y-1.5">
              {byNeed(n).map((t) => <NodeName key={t} type={t} />)}
            </dd>
          </div>
        ))}
      </dl>

      <h4 className="mt-5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Dây cần nối</h4>
      <ul className="mt-2 divide-y rounded-lg border text-sm">
        {recipe.edges.map((e) => {
          const type = NODE_DEFINITIONS[e.to].inputs.find((p) => p.id === e.port)!.type;
          return (
            <li key={`${e.from}-${e.to}-${e.port}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
              <span className={cn('size-2 shrink-0 rounded-full', PORT_DOT[type])} aria-hidden />
              <span>{label(e.from)}</span>
              <ArrowRight className="size-3.5 text-muted-foreground" aria-label="nối vào" />
              <span>{label(e.to)}</span>
              <span className="text-xs text-muted-foreground">({PORT_TYPE_LABELS[type]})</span>
              {e.required && <span className="ml-auto text-xs font-semibold">bắt buộc</span>}
            </li>
          );
        })}
      </ul>

      <Link
        href={`/flow?template=${recipe.templateId}`}
        className="mt-4 inline-flex items-center gap-1 self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Mở template mẫu “{recipe.templateName}”
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </article>
  );
}

function NodeEntry({ type }: { type: NodeType }) {
  const def = NODE_DEFINITIONS[type];
  const { connect, tips } = TIPS[type];
  return (
    <article id={`node-${type}`} className="scroll-mt-20 rounded-xl border bg-card p-5" aria-labelledby={`node-${type}-title`}>
      <div className="flex flex-wrap items-start gap-3">
        <NodeIconChip type={type} />
        <div className="min-w-0 flex-1">
          <h3 id={`node-${type}-title`} className="font-semibold">{def.label}</h3>
          <p className="text-sm text-muted-foreground">{def.description}</p>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {def.aiCallsPerRatio ? `${def.aiCallsPerRatio} lượt AI / kích thước` : 'Không tốn lượt AI'}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
        <span className="inline-flex items-center gap-1.5">Ghép layer: <NeedBadge need={NEED[type].composed} /></span>
        <span className="inline-flex items-center gap-1.5">Flat: <NeedBadge need={NEED[type].flat} /></span>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-[96px_1fr]">
        <dt className="text-muted-foreground">Port vào</dt>
        <dd className="flex flex-wrap gap-1.5">
          {def.inputs.length
            ? def.inputs.map((p) => <PortChip key={p.id} type={p.type} required={p.required} />)
            : <span className="text-muted-foreground">Không có – node nguồn</span>}
        </dd>
        <dt className="text-muted-foreground">Port ra</dt>
        <dd className="flex flex-wrap gap-1.5">
          {def.outputs.length
            ? def.outputs.map((p) => <PortChip key={p.id} type={p.type} />)
            : <span className="text-muted-foreground">Không có – điểm cuối của flow</span>}
        </dd>
        <dt className="text-muted-foreground">Nối</dt>
        <dd>{connect}</dd>
      </dl>

      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm marker:text-muted-foreground">
        {tips.map((t) => <li key={t}>{t}</li>)}
      </ul>
    </article>
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
          <span className="truncate text-sm text-muted-foreground">Hướng dẫn dùng node</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-14 px-4 py-10">
        <section aria-labelledby="intro" className="max-w-3xl">
          <h1 id="intro" className="text-2xl font-semibold tracking-tight">Hướng dẫn dùng node trên Flow canvas</h1>
          <p className="mt-3 text-muted-foreground">
            Mỗi node làm 1 việc: đưa dữ liệu vào (ảnh, brief, chữ), cấu hình (kích thước, phong cách), tạo ảnh bằng AI
            hoặc ghép và xuất. Nối port ra của node này vào port vào cùng màu của node kia. Flow chạy từ trái sang phải,
            kết thúc ở <strong className="font-medium text-foreground">Xuất ảnh</strong>.
          </p>
          <p className="mt-2 text-muted-foreground">
            Không cần dựng từ đầu: chọn template ở góc trên trái canvas rồi sửa. Chế độ <em>Đơn giản</em> chỉ hiện các ô cần điền.
          </p>
        </section>

        <section aria-labelledby="recipes">
          <h2 id="recipes" className="text-lg font-semibold">Một flow hoàn chỉnh cần gì</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Có 2 kiểu flow, chọn theo node tạo ảnh. Không trộn node của hai kiểu trong cùng 1 flow.
          </p>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {RECIPES.map((r) => <RecipeCard key={r.id} recipe={r} />)}
          </div>
          <div className="mt-4 rounded-xl border bg-muted/40 p-4 text-sm">
            <p className="font-medium">Flow tối thiểu chạy được vs. flow nên có</p>
            <p className="mt-1 text-muted-foreground">
              Chỉ có node <em>Bắt buộc</em> thì flow chạy được nhưng banner chỉ là nền trống. Banner dùng được nên có thêm
              ít nhất 1 ảnh sản phẩm, 1 Text tiêu đề và Phong cách. Brand kit và Ảnh tham chiếu dùng khi cần đúng màu thương
              hiệu hoặc bám style có sẵn.
            </p>
          </div>
        </section>

        <section aria-labelledby="rules">
          <h2 id="rules" className="text-lg font-semibold">Quy tắc nối dây</h2>
          <ul className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            {[
              ['Cùng màu mới nối được', 'Port ra và port vào phải cùng kiểu dữ liệu. Khi đang kéo dây, ô nối được sẽ sáng lên, ô không nối được mờ đi.'],
              ['Port nhận 1 hay nhiều dây', 'Asset, Text, Ảnh tham chiếu nhận nhiều dây; các port còn lại chỉ nhận 1. Muốn đổi nguồn: xoá dây cũ trước.'],
              ['Đi một chiều', 'Không nối quay ngược tạo vòng lặp, không nối node vào chính nó.'],
              ['Đúng 1 Xuất ảnh, đúng 1 nguồn', 'Xuất ảnh nhận Bản ghép (Ghép layer) hoặc Ảnh (Tạo banner flat), không cả hai.'],
            ].map(([title, body]) => (
              <li key={title} className="rounded-xl border bg-card p-4">
                <p className="font-medium">{title}</p>
                <p className="mt-1 text-muted-foreground">{body}</p>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Màu port">
            {(Object.keys(PORT_TYPE_LABELS) as PortType[]).map((t) => <PortChip key={t} type={t} />)}
          </div>
        </section>

        <section aria-labelledby="nodes">
          <h2 id="nodes" className="text-lg font-semibold">Từng node</h2>
          <nav aria-label="Danh sách node" className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {TYPES.map((t) => (
              <a key={t} href={`#node-${t}`} className="text-muted-foreground hover:text-foreground hover:underline">{label(t)}</a>
            ))}
          </nav>
          <div className="mt-6 space-y-10">
            {KINDS.map((kind) => (
              <div key={kind}>
                <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{KIND_LABELS[kind]}</h3>
                <div className="grid gap-4 lg:grid-cols-2">
                  {TYPES.filter((t) => NODE_DEFINITIONS[t].kind === kind).map((t) => <NodeEntry key={t} type={t} />)}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="issues">
          <h2 id="issues" className="text-lg font-semibold">Lỗi và cảnh báo hay gặp</h2>
          <p className="mt-1 text-sm text-muted-foreground">Lỗi chặn chạy flow; cảnh báo vẫn chạy được. Cả hai hiện trên node và ở Inspector.</p>
          <ul className="mt-4 divide-y rounded-xl border bg-card text-sm">
            {COMMON_ISSUES.map((i) => (
              <li key={i.title} className="flex gap-3 p-4">
                {i.severity === 'error'
                  ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Lỗi" />
                  : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-run-stale" aria-label="Cảnh báo" />}
                <div>
                  <p className="font-medium">{i.title}</p>
                  <p className="mt-0.5 text-muted-foreground">{i.fix}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="tips" className="pb-6">
          <h2 id="tips" className="flex items-center gap-2 text-lg font-semibold">
            <Keyboard className="size-5 text-muted-foreground" aria-hidden />
            Thao tác nhanh
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm marker:text-muted-foreground">
            <li>Thêm node: kéo từ thư viện bên trái vào canvas, hoặc bấm vào node trong thư viện.</li>
            <li>Kéo ảnh từ máy vào canvas: thả chỗ trống tạo node Asset, thả lên node ảnh để thay ảnh.</li>
            <li>Chọn node để sửa chi tiết ở Inspector bên phải.</li>
            <li>Hoàn tác ⌘/Ctrl+Z, làm lại ⇧⌘Z / Ctrl+Y. Lưu project ⌘/Ctrl+S.</li>
            <li>Số lượt AI hiện trên nút “Chạy tất cả” trước khi chạy; kích thước đã có kết quả và không đổi thì không tốn lượt lại.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
