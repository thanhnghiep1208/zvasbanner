"use client";

import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { SessionsPanel } from "@/components/account/SessionsPanel";
import { Button } from "@/components/ui/button";

export default function AccountSessionsPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated || !isLoaded) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 py-8">
        <p className="text-sm text-zinc-600" role="status">
          Đang tải…
        </p>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-4 px-4 py-8 text-center">
        <p className="text-sm text-zinc-600">
          Bạn cần đăng nhập để quản lý phiên đăng nhập.
        </p>
        <SignInButton mode="redirect" forceRedirectUrl="/account/sessions">
          <Button type="button">Đăng nhập</Button>
        </SignInButton>
        <Link href="/" className="text-sm text-indigo-600 hover:underline">
          Về trang chủ
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 py-8">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900"
        >
          <ArrowLeft className="size-4" />
          Trang chủ
        </Link>
      </div>
      <SessionsPanel />
    </main>
  );
}
