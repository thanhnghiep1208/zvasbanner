"use client";

import * as React from "react";
import { useClerk } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionListItem } from "@/lib/clerk-sessions";

type SessionsResponse = {
  sessions?: SessionListItem[];
  error?: string;
};

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "Vừa xong";
  if (diff < 3_600_000) {
    const m = Math.floor(diff / 60_000);
    return `${m} phút trước`;
  }
  if (diff < 86_400_000) {
    const h = Math.floor(diff / 3_600_000);
    return `${h} giờ trước`;
  }
  const d = Math.floor(diff / 86_400_000);
  return `${d} ngày trước`;
}

export function SessionsPanel() {
  const router = useRouter();
  const { signOut } = useClerk();
  const [sessions, setSessions] = React.useState<SessionListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busySessionId, setBusySessionId] = React.useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = React.useState(false);

  const loadSessions = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sessions", { cache: "no-store" });
      const json = (await res.json()) as SessionsResponse;
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setSessions(Array.isArray(json.sessions) ? json.sessions : []);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Không thể tải danh sách phiên đăng nhập."
      );
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const revokeSession = async (sessionId: string) => {
    setBusySessionId(sessionId);
    try {
      const res = await fetch(
        `/api/sessions?sessionId=${encodeURIComponent(sessionId)}`,
        { method: "DELETE" }
      );
      const json = (await res.json()) as {
        error?: string;
        revokedCurrent?: boolean;
      };
      if (!res.ok) {
        throw new Error(json.error ?? "Không thể đăng xuất phiên.");
      }
      if (json.revokedCurrent) {
        try {
          await signOut();
        } catch {
          // ignore
        }
        router.replace("/sign-in");
        return;
      }
      await loadSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể đăng xuất phiên.");
    } finally {
      setBusySessionId(null);
    }
  };

  const revokeOtherSessions = async () => {
    const others = sessions.filter((s) => !s.isCurrent);
    if (others.length === 0) return;

    setRevokingOthers(true);
    setError(null);
    try {
      for (const session of others) {
        const res = await fetch(
          `/api/sessions?sessionId=${encodeURIComponent(session.sessionId)}`,
          { method: "DELETE" }
        );
        const json = (await res.json()) as { error?: string };
        if (!res.ok) {
          throw new Error(json.error ?? "Không thể đăng xuất phiên khác.");
        }
      }
      await loadSessions();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Không thể đăng xuất tất cả phiên khác."
      );
    } finally {
      setRevokingOthers(false);
    }
  };

  const otherCount = sessions.filter((s) => !s.isCurrent).length;

  return (
    <Card className="border-zinc-200 shadow-sm">
      <CardHeader className="gap-3">
        <div>
          <CardTitle className="text-lg">Phiên đăng nhập</CardTitle>
          <p className="text-sm text-zinc-600">
            Mỗi trình duyệt hoặc thiết bị có một phiên riêng. Bạn có thể đăng xuất từ xa
            các thiết bị không còn dùng.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void loadSessions()}
          >
            Làm mới
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={loading || revokingOthers || otherCount === 0}
            onClick={() => void revokeOtherSessions()}
          >
            {revokingOthers ? (
              <>
                <Loader2 className="mr-1 size-3.5 animate-spin" />
                Đang xử lý…
              </>
            ) : (
              `Đăng xuất ${otherCount} phiên khác`
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-zinc-600" role="status">
            <Loader2 className="size-4 animate-spin" />
            Đang tải phiên…
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-rose-700" role="alert">
            {error}
          </p>
        ) : null}
        {!loading && sessions.length === 0 ? (
          <p className="text-sm text-zinc-600">Không có phiên đăng nhập đang hoạt động.</p>
        ) : null}
        <ul className="space-y-2">
          {sessions.map((session) => (
            <li
              key={session.sessionId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-zinc-900">{session.deviceLabel}</p>
                  {session.isCurrent ? (
                    <Badge variant="secondary" className="text-[10px]">
                      Phiên hiện tại
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-zinc-500">
                  Hoạt động {formatRelativeTime(session.lastActiveAt)} · Tạo{" "}
                  {new Date(session.createdAt).toLocaleString("vi-VN")}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={session.isCurrent ? "outline" : "destructive"}
                disabled={busySessionId === session.sessionId || revokingOthers}
                onClick={() => void revokeSession(session.sessionId)}
              >
                {busySessionId === session.sessionId ? (
                  <>
                    <Loader2 className="mr-1 size-3.5 animate-spin" />
                    Đang xử lý…
                  </>
                ) : session.isCurrent ? (
                  "Đăng xuất thiết bị này"
                ) : (
                  "Đăng xuất"
                )}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
