import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

interface AuthLayoutProps {
  children: ReactNode;
  className?: string;
}

export function AuthLayout({ children, className }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className={cn('w-full max-w-md space-y-8', className)}>
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">
              AL
            </div>
            <span className="text-2xl font-bold text-foreground">
              AgentLoom
            </span>
          </div>
          <p className="text-sm text-muted">
            多智能体工作流编排平台
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-8 shadow-lg">
          {children}
        </div>
      </div>
    </div>
  );
}
