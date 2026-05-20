"use client";

import { useAuth } from "@clerk/nextjs";
import * as React from "react";

type AccessResponse = {
  canViewDashboard?: boolean;
};

/**
 * Whether the signed-in user may open the analytics dashboard (admin/mod).
 * Returns false while loading or when signed out.
 */
export function useCanViewDashboard(): boolean {
  const { isLoaded, isSignedIn } = useAuth();
  const [canView, setCanView] = React.useState(false);

  React.useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setCanView(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/access", { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          setCanView(false);
          return;
        }
        const json = (await res.json()) as AccessResponse;
        setCanView(Boolean(json.canViewDashboard));
      } catch {
        if (!cancelled) setCanView(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  return canView;
}
