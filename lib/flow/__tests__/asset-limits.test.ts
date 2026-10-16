import { describe, expect, it } from 'vitest';
import { dataUrlByteSize, isReferenceRole, REFERENCE_MAX_BYTES } from '../asset-limits';

describe('asset-limits', () => {
  it('giới hạn ảnh tham chiếu 4MB, chỉ áp cho style-reference và background', () => {
    expect(REFERENCE_MAX_BYTES).toBe(4 * 1024 * 1024);
    expect(isReferenceRole('style-reference')).toBe(true);
    expect(isReferenceRole('background')).toBe(true);
    for (const r of ['image', 'logo', 'decoration'] as const) expect(isReferenceRole(r)).toBe(false);
  });

  it('dataUrlByteSize = số byte file gốc', () => {
    const bytes = (n: number) => `data:image/png;base64,${Buffer.alloc(n, 7).toString('base64')}`;
    for (const n of [0, 1, 2, 3, 1000, 4097]) expect(dataUrlByteSize(bytes(n))).toBe(n);
  });
});
