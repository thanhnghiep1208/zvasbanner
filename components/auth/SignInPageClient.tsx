"use client";

import { SignIn, useAuth, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";

/**
 * Sign-in page for Clerk **username + password** (strategies configured in Dashboard).
 * No Google/OAuth logic in app code — only Clerk <SignIn /> + Dashboard settings.
 */
export function SignInPageClient() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const router = useRouter();
  const [clearing, setClearing] = React.useState(false);

  const redirectHome = React.useCallback(() => {
    router.replace("/");
  }, [router]);

  React.useEffect(() => {
    if (isLoaded && isSignedIn) {
      redirectHome();
    }
  }, [isLoaded, isSignedIn, redirectHome]);

  const handleClearSession = React.useCallback(() => {
    setClearing(true);
    void (async () => {
      try {
        await signOut();
      } catch {
        // ignore
      }
      window.location.href = "/sign-in";
    })();
  }, [signOut]);

  if (!isLoaded) {
    return (
      <p className="text-sm text-zinc-600" role="status">
        Đang tải…
      </p>
    );
  }

  if (isSignedIn) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-zinc-600" role="status">
          Đang chuyển về trang chủ…
        </p>
        <Button type="button" variant="outline" size="sm" onClick={redirectHome}>
          Về trang chủ
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <div className="max-w-sm text-center text-sm text-zinc-600">
        <p className="font-medium text-zinc-800">Đăng nhập username &amp; mật khẩu</p>
        <p className="mt-1 text-xs leading-relaxed">
          Dùng <strong>username</strong> và mật khẩu do admin cấp trong Clerk (không đăng
          nhập Google). Sau khi đổi sang username/password, hãy xóa cookie cũ một lần nếu
          gặp lỗi 409.
        </p>
      </div>
      <SignIn
        routing="path"
        path="/sign-in"
        forceRedirectUrl="/"
        appearance={{
          elements: {
            footer: "hidden",
            footerAction: "hidden",
            socialButtonsBlockButton: "hidden",
            dividerRow: "hidden",
          },
        }}
      />
      <div className="flex flex-wrap items-center justify-center gap-2 text-center text-xs text-zinc-500">
        <span>Lỗi 409 / phiên Google cũ?</span>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          disabled={clearing}
          onClick={handleClearSession}
        >
          {clearing ? "Đang xóa phiên…" : "Xóa phiên & thử lại"}
        </Button>
        <span>·</span>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={redirectHome}
        >
          Về trang chủ
        </Button>
      </div>
    </div>
  );
}
