"use client";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delay={200}>
      {children}
      <Toaster position="top-center" richColors closeButton />
    </TooltipProvider>
  );
}
