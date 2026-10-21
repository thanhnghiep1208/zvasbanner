"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  EMPTY_CONTACT_INFO,
  validateContactInfo,
  type ContactInfo,
} from "@/lib/contact-info";

type ContactResponse = {
  contact?: ContactInfo;
  source?: "db" | "env";
  error?: string;
};

/** Admin chỉnh email / số Zalo hiện ở màn hình "Cần đăng nhập để tạo banner". */
export function ContactSettingsCard() {
  const [saved, setSaved] = React.useState<ContactInfo>(EMPTY_CONTACT_INFO);
  const [draft, setDraft] = React.useState<ContactInfo>(EMPTY_CONTACT_INFO);
  const [source, setSource] = React.useState<"db" | "env">("env");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/settings/contact", { cache: "no-store" });
        const json = (await res.json()) as ContactResponse;
        if (cancelled) return;
        if (!res.ok || !json.contact) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        setSaved(json.contact);
        setDraft(json.contact);
        setSource(json.source ?? "env");
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Không tải được cài đặt.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = draft.email.trim() !== saved.email || draft.phone.trim() !== saved.phone;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = validateContactInfo(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/contact", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.value),
      });
      const json = (await res.json()) as ContactResponse;
      if (!res.ok || !json.contact) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setSaved(json.contact);
      setDraft(json.contact);
      setSource("db");
      setError(null);
      toast.success("Đã lưu thông tin liên hệ.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được cài đặt.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thông tin liên hệ cấp tài khoản</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-zinc-600">
          Hiện cho người chưa đăng nhập ở trang tạo banner. Để trống để ẩn mục đó.
          {source === "env" && !loading
            ? " Đang dùng giá trị mặc định từ CONTACT_EMAIL / CONTACT_PHONE."
            : null}
        </p>
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={onSubmit}>
          <label className="grid gap-1 text-sm font-medium text-zinc-800">
            Email
            <Input
              type="email"
              autoComplete="off"
              placeholder="lienhe@example.com"
              value={draft.email}
              disabled={loading || saving}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-800">
            Zalo / số điện thoại
            <Input
              type="tel"
              autoComplete="off"
              placeholder="0901 234 567"
              value={draft.phone}
              disabled={loading || saving}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
            />
          </label>
          <Button type="submit" className="h-8" disabled={loading || saving || !dirty}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Lưu
          </Button>
        </form>
        {error ? (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
