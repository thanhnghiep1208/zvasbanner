"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SessionListItem } from "@/lib/clerk-sessions";

type SessionsApiResponse = {
  sessions?: SessionListItem[];
  targetUserId?: string;
  error?: string;
};

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "Vừa xong";
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)} phút trước`;
  }
  if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)} giờ trước`;
  }
  return `${Math.floor(diff / 86_400_000)} ngày trước`;
}

export function UserSessionsDialog({
  open,
  onOpenChange,
  targetUserId,
  displayName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string | null;
  displayName: string;
}) {
  const [sessions, setSessions] = React.useState<SessionListItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busySessionId, setBusySessionId] = React.useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = React.useState<SessionListItem | null>(
    null
  );

  const loadSessions = React.useCallback(async () => {
    if (!targetUserId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/users/sessions?targetUserId=${encodeURIComponent(targetUserId)}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as SessionsApiResponse;
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setSessions(Array.isArray(json.sessions) ? json.sessions : []);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Không thể tải danh sách phiên."
      );
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  React.useEffect(() => {
    if (open && targetUserId) {
      void loadSessions();
    }
    if (!open) {
      setSessions([]);
      setError(null);
      setConfirmRevoke(null);
    }
  }, [open, targetUserId, loadSessions]);

  const revokeSession = async (session: SessionListItem) => {
    if (!targetUserId) return;
    setBusySessionId(session.sessionId);
    try {
      const res = await fetch(
        `/api/dashboard/users/sessions?targetUserId=${encodeURIComponent(targetUserId)}&sessionId=${encodeURIComponent(session.sessionId)}`,
        { method: "DELETE" }
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Không thể thu hồi phiên.");
      }
      setConfirmRevoke(null);
      await loadSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể thu hồi phiên.");
    } finally {
      setBusySessionId(null);
    }
  };

  if (!open || !targetUserId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Phiên đăng nhập — ${displayName}`}
    >
      <SessionsDialogPanel
        displayName={displayName}
        loading={loading}
        error={error}
        sessions={sessions}
        busySessionId={busySessionId}
        confirmRevoke={confirmRevoke}
        onClose={() => onOpenChange(false)}
        onRefresh={() => void loadSessions()}
        onRequestRevoke={setConfirmRevoke}
        onConfirmRevoke={(session) => void revokeSession(session)}
        onCancelRevoke={() => setConfirmRevoke(null)}
      />
    </div>
  );
}

function SessionsDialogPanel({
  displayName,
  loading,
  error,
  sessions,
  busySessionId,
  confirmRevoke,
  onClose,
  onRefresh,
  onRequestRevoke,
  onConfirmRevoke,
  onCancelRevoke,
}: {
  displayName: string;
  loading: boolean;
  error: string | null;
  sessions: SessionListItem[];
  busySessionId: string | null;
  confirmRevoke: SessionListItem | null;
  onClose: () => void;
  onRefresh: () => void;
  onRequestRevoke: (session: SessionListItem) => void;
  onConfirmRevoke: (session: SessionListItem) => void;
  onCancelRevoke: () => void;
}) {
  return (
    <>
      <div className="flex max-h-[min(85vh,640px)] w-full max-w-lg flex-col rounded-xl border border-zinc-200 bg-white shadow-xl">
        <div className="border-b border-zinc-200 px-4 py-3">
          <h3 className="text-base font-semibold text-zinc-900">
            Phiên đăng nhập — {displayName}
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Thu hồi phiên sẽ đăng xuất thiết bị đó ngay lập tức.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-zinc-600">
              <Loader2 className="size-4 animate-spin" />
              Đang tải…
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-rose-700" role="alert">
              {error}
            </p>
          ) : null}
          {!loading && sessions.length === 0 ? (
            <p className="text-sm text-zinc-600">Không có phiên active.</p>
          ) : null}
          <ul className="space-y-2">
            {sessions.map((session) => (
              <li
                key={session.sessionId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900">
                    {session.deviceLabel}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatRelativeTime(session.lastActiveAt)}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={busySessionId === session.sessionId}
                  onClick={() => onRequestRevoke(session)}
                >
                  Thu hồi
                </Button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3">
          <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
            Làm mới
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>

      {confirmRevoke ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Xác nhận thu hồi phiên"
        >
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-4 shadow-xl">
            <h4 className="text-base font-semibold text-zinc-900">Thu hồi phiên?</h4>
            <p className="mt-2 text-sm text-zinc-600">
              Đăng xuất thiết bị{" "}
              <span className="font-medium">{confirmRevoke.deviceLabel}</span>?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onCancelRevoke}>
                Hủy
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busySessionId === confirmRevoke.sessionId}
                onClick={() => onConfirmRevoke(confirmRevoke)}
              >
                {busySessionId === confirmRevoke.sessionId
                  ? "Đang xử lý…"
                  : "Thu hồi"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
