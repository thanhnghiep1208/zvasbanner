'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, FolderOpen, LoaderCircle, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { FLOW_DOC_LIMITS } from '@/lib/flow/persistence';
import { flowDocsApi, type FlowDocSummary } from '@/lib/flow-ui/docs-api';
import { cn } from '@/lib/utils';
import { useFlowStore } from '@/store/flow-store';
import { setDocUrl, useFlowDocs } from './use-flow-docs';

const timeFmt = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Project (T6.1): tên + Lưu (⌘/Ctrl+S) + danh sách project đã lưu (mở / xoá).
 * Trạng thái: "Chưa lưu" (chưa lưu lần nào), "Có thay đổi", "Đã lưu".
 */
export function ProjectMenu() {
  const docId = useFlowStore((s) => s.docId);
  const title = useFlowStore((s) => s.docTitle);
  const setTitle = useFlowStore((s) => s.setDocTitle);
  const dirty = useFlowStore((s) => s.graph !== s.savedGraph);
  const isRunning = useFlowStore((s) => s.isRunning);
  const { save, open, saving } = useFlowDocs();
  const [menuOpen, setMenuOpen] = useState(false);
  const [docs, setDocs] = useState<FlowDocSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  // Mở khi có thay đổi chưa lưu / xoá: hỏi lại trước (xoá không hoàn tác được).
  const [confirm, setConfirm] = useState<{ kind: 'open' | 'delete'; doc: FlowDocSummary } | null>(null);

  const status = !docId ? 'Chưa lưu' : dirty ? 'Có thay đổi' : 'Đã lưu';

  const refresh = useCallback(async () => {
    setListError(null);
    try {
      setDocs(await flowDocsApi.list());
    } catch (e) {
      setListError((e as Error).message);
    }
  }, []);

  const onOpenChange = (o: boolean) => {
    setMenuOpen(o);
    if (o) void refresh();
    else setConfirm(null);
  };

  // ⌘/Ctrl+S ở bất kỳ đâu trong studio.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!saving) void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, saving]);

  const openDoc = async (d: FlowDocSummary, confirmed = false) => {
    if (dirty && d.id !== docId && !confirmed) return setConfirm({ kind: 'open', doc: d });
    setConfirm(null);
    if (await open(d.id)) setMenuOpen(false);
  };

  const remove = async (d: FlowDocSummary) => {
    setConfirm(null);
    try {
      await flowDocsApi.remove(d.id);
      setDocs((list) => list?.filter((x) => x.id !== d.id) ?? null);
      // Xoá project đang mở: giữ graph trên màn hình như project mới chưa lưu.
      if (d.id === useFlowStore.getState().docId) {
        useFlowStore.setState({ docId: null, savedGraph: null });
        setDocUrl(null);
      }
      toast.success(`Đã xoá “${d.title}”.`);
    } catch (e) {
      toast.error(`Xoá thất bại: ${(e as Error).message}`);
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Popover open={menuOpen} onOpenChange={onOpenChange}>
        <PopoverTrigger
          aria-label={`Project: ${title}, ${status}. Mở danh sách project`}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'min-w-0 gap-1.5 px-2')}
        >
          <FolderOpen className="text-muted-foreground" aria-hidden />
          <span className="hidden max-w-24 truncate font-medium md:inline xl:max-w-36">{title}</span>
          <span
            className={cn('text-xs', status === 'Đã lưu' ? 'text-muted-foreground' : 'text-run-stale')}
            aria-hidden
          >
            {status}
          </span>
          <ChevronDown className="text-muted-foreground" aria-hidden />
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-2rem))] gap-3 p-3">
          <PopoverTitle className="sr-only">Project</PopoverTitle>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => { e.preventDefault(); void save().then((ok) => { if (ok) void refresh(); }); }}
          >
            <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs font-medium">
              Tên project
              <Input value={title} maxLength={FLOW_DOC_LIMITS.maxTitleLength} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Save aria-hidden />}
              Lưu
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">Ảnh không được lưu – mở lại project cần tải lại ảnh.</p>

          <div className="flex flex-col gap-1 border-t pt-2">
            <p className="px-1 text-xs font-medium text-muted-foreground">Project đã lưu</p>
            {confirm && (
              <div className="flex flex-col gap-2 rounded-md bg-muted/60 p-2.5 text-sm" role="alertdialog"
                aria-label={confirm.kind === 'open' ? 'Xác nhận mở project' : 'Xác nhận xoá project'}>
                {confirm.kind === 'open'
                  ? <p>Mở <span className="font-medium">“{confirm.doc.title}”</span> sẽ bỏ thay đổi chưa lưu.</p>
                  : <p>Xoá vĩnh viễn <span className="font-medium">“{confirm.doc.title}”</span>? Không hoàn tác được.</p>}
                <div className="flex justify-end gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(null)}>Huỷ</Button>
                  {confirm.kind === 'open'
                    ? <Button type="button" size="sm" onClick={() => void openDoc(confirm.doc, true)}>Mở project</Button>
                    : <Button type="button" size="sm" variant="destructive" onClick={() => void remove(confirm.doc)}>Xoá</Button>}
                </div>
              </div>
            )}
            {listError ? (
              <p className="px-1 text-xs text-destructive">{listError}</p>
            ) : docs === null ? (
              <p className="px-1 text-xs text-muted-foreground">Đang tải…</p>
            ) : docs.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">Chưa có project nào.</p>
            ) : (
              <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
                {docs.map((d) => (
                  <li key={d.id} className="group flex items-center gap-1 rounded-md hover:bg-muted">
                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={() => void openDoc(d)}
                      aria-current={d.id === docId || undefined}
                      className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
                    >
                      <span className="w-full truncate text-sm font-medium">
                        {d.title}{d.id === docId && <span className="font-normal text-muted-foreground"> · đang mở</span>}
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">{timeFmt.format(new Date(d.updatedAt))}</span>
                    </button>
                    <Button
                      type="button" variant="ghost" size="icon-sm" aria-label={`Xoá ${d.title}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setConfirm({ kind: 'delete', doc: d })}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
