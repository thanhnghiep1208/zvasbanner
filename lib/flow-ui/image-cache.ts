/**
 * Cache ảnh kết quả theo step key (T4.7) – trong bộ nhớ tab, KHÔNG persist (SPEC 2.5: ảnh data URL lớn).
 * LRU giới hạn số ảnh để không phình RAM (mỗi ảnh ~0.5–1.5MB data URL).
 */
import type { ImageCache } from '@/lib/flow/executor';

const MAX_ENTRIES = 40;
const entries = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;

export const imageCache: ImageCache = {
  get(key) {
    const v = entries.get(key);
    if (v !== undefined) {
      // LRU: đưa lên cuối
      entries.delete(key);
      entries.set(key, v);
    }
    return v;
  },
  set(key, image) {
    entries.delete(key);
    entries.set(key, image);
    while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
    version++;
    for (const l of listeners) l();
  },
};

/** Cho useSyncExternalStore: tính lại số lượt AI còn cần khi cache đổi. */
export function subscribeImageCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const imageCacheVersion = () => version;

/** Chỉ cho test. */
export function clearImageCache() {
  entries.clear();
  version++;
  for (const l of listeners) l();
}
