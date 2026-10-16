/** Trạng thái chạy của node (SPEC 5.5). Executor (T2.6, T4.7) ghi; UI chỉ đọc. */
export type RunState = 'idle' | 'stale' | 'queued' | 'running' | 'done' | 'error';

export interface NodeRunInfo {
  state: RunState;
  /** Lỗi hiển thị tại node khi `state = 'error'`. */
  message?: string;
  /** Ảnh kết quả (URL / data URL) khi `state = 'done'`. Không persist (SPEC 2.5). */
  previewUrl?: string;
  /** Cache key của node lúc chạy xong (T4.7). Key hiện tại khác → node "Cần chạy lại" (stale). */
  key?: string;
}

export const RUN_STATE_LABELS: Record<RunState, string> = {
  idle: 'Chưa chạy',
  stale: 'Cần chạy lại',
  queued: 'Đang chờ',
  running: 'Đang chạy',
  done: 'Xong',
  error: 'Lỗi',
};
