import { describe, expect, it } from 'vitest';
import { decompileJob } from '@/lib/flow/decompiler';
import { flatMinimal } from '@/lib/flow/__tests__/fixtures';
import { markFlowOpenSource, runErrorCode, takeFlowOpenSource } from '../flow-analytics';

const graph = decompileJob(flatMinimal);

describe('runErrorCode (T6.3)', () => {
  it.each([
    [[{ message: '[E-BG-GEMINI_TIMEOUT] Gemini phản hồi quá chậm.', nodeId: 'n-generate' }], 'E-BG-GEMINI_TIMEOUT'],
    [[{ message: 'Lỗi [E-GEN-429] quá nhiều', nodeId: 'n-generate' }], 'E-GEN-429'],
    [[{ message: 'Cần tải ảnh lên trước khi chạy.', nodeId: 'n-product-0' }], 'node:product-asset'],
    [[{ message: 'Graph có vòng lặp.' }], 'graph'],
    [[], 'unknown'],
  ])('%j → %s', (errors, code) => {
    expect(runErrorCode(errors, graph)).toBe(code);
  });
});

describe('nguồn mở /flow', () => {
  it('đọc 1 lần rồi xoá', () => {
    expect(takeFlowOpenSource()).toBeNull();
    markFlowOpenSource('form');
    expect(takeFlowOpenSource()).toBe('form');
    expect(takeFlowOpenSource()).toBeNull();
  });
});
