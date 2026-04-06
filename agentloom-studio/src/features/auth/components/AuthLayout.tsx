import type { ReactNode } from "react";

import { BrandMark } from "@/shared/components/brand";
import { cn } from "@/shared/lib/utils";

interface AuthLayoutProps {
  children: ReactNode;
  className?: string;
}

export function AuthLayout({ children, className }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className={cn("w-full max-w-md space-y-8", className)}>
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-3">
            <BrandMark
              size="lg"
              className="bg-surface ring-border shadow-[0_24px_72px_rgba(2,6,23,0.36)]"
            />
            <div className="space-y-1 text-left">
              <span className="block text-2xl font-bold text-foreground">
                AgentLoom
              </span>
              <span className="block text-sm font-medium uppercase tracking-[0.24em] text-primary/90">
                Studio
              </span>
            </div>
          </div>
          <p className="text-sm text-muted">多智能体工作流编排平台</p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-8 shadow-lg">
          {children}
        </div>
      </div>
    </div>
  );
}
