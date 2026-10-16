import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTemplate } from '@/lib/flow/template';
import { COALESCE_MS, redo, undo, useFlowHistory } from '../flow-history';
import { useFlowStore } from '../flow-store';

const headline = () => (useFlowStore.getState().graph.nodes.find((n) => n.id === 'n-text-headline')!.params as { content: string }).content;
const setHeadline = (content: string) => useFlowStore.getState().updateNodeParams<'text-layer'>('n-text-headline', { content });

describe('flow-history (undo/redo)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useFlowStore.getState().loadTemplate(getTemplate('product-hero')!);
  });
  afterEach(() => vi.useRealTimers());

  it('nạp template → lịch sử trống', () => {
    expect(useFlowHistory.getState()).toEqual({ past: [], future: [] });
  });

  it('gõ liên tục = 1 bước; undo về trước loạt gõ, redo quay lại', () => {
    const original = headline();
    setHeadline('A');
    vi.advanceTimersByTime(100);
    setHeadline('AB');
    vi.advanceTimersByTime(100);
    setHeadline('ABC');
    expect(useFlowHistory.getState().past).toHaveLength(1);
    expect(undo()).toBe(true);
    expect(headline()).toBe(original);
    expect(redo()).toBe(true);
    expect(headline()).toBe('ABC');
    expect(redo()).toBe(false);
  });

  it('2 thay đổi cách nhau đủ lâu = 2 bước; sửa sau undo xoá nhánh redo', () => {
    setHeadline('A');
    vi.advanceTimersByTime(COALESCE_MS + 1);
    setHeadline('B');
    expect(useFlowHistory.getState().past).toHaveLength(2);
    undo();
    expect(headline()).toBe('A');
    vi.advanceTimersByTime(COALESCE_MS + 1);
    setHeadline('C');
    expect(useFlowHistory.getState().future).toEqual([]);
    undo();
    expect(headline()).toBe('A');
  });

  it('undo không ghi thêm lịch sử; hết lịch sử thì trả false', () => {
    setHeadline('A');
    undo();
    expect(useFlowHistory.getState().past).toHaveLength(0);
    expect(undo()).toBe(false);
  });
});
