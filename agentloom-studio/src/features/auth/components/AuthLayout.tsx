import type { ReactNode } from "react";
import { motion } from "motion/react";

import { BrandMark } from "@/shared/components/brand";
import { fadeInUp } from "@/shared/lib/motion";
import { cn } from "@/shared/lib/utils";
import { Card } from "@/shared/ui/card";

const DEFAULT_SUBTITLE = "多智能体工作流编排平台";

interface AuthLayoutProps {
  children: ReactNode;
  /** 卡片主标题，页面自身的语义标题（如「登录」）；省略时只显示品牌区 */
  title?: ReactNode;
  /** 主标题下的说明文案，省略时回落到平台标语 */
  subtitle?: ReactNode;
  className?: string;
}

export function AuthLayout({
  children,
  title,
  subtitle,
  className,
}: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* 品牌光晕背景 — 纯装饰，不参与命中测试 */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-56 left-1/2 h-[26rem] w-[34rem] -translate-x-1/2 rounded-full opacity-[0.10] blur-3xl"
          style={{ backgroundImage: "var(--color-brand-gradient)" }}
        />
        <div
          className="absolute -bottom-52 -left-32 h-[22rem] w-[22rem] rounded-full opacity-[0.07] blur-3xl"
          style={{ backgroundImage: "var(--color-brand-gradient)" }}
        />
      </div>

      <motion.div
        {...fadeInUp}
        className={cn("relative w-full max-w-md", className)}
      >
        <Card className="rounded-panel p-6 shadow-popover sm:p-8">
          <div className="flex items-center gap-3">
            <BrandMark size="md" className="bg-surface ring-border" />
            <div className="flex flex-col">
              <span className="text-lg font-semibold leading-tight tracking-tight text-foreground">
                AgentLoom
              </span>
              <span className="mt-1 text-[10px] font-semibold uppercase leading-none tracking-[0.28em] text-primary">
                Studio
              </span>
            </div>
          </div>

          {title ? (
            <h1 className="mt-7 text-xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
          ) : null}
          <p className={cn("text-sm text-muted", title ? "mt-1.5" : "mt-5")}>
            {subtitle ?? DEFAULT_SUBTITLE}
          </p>

          <div className="mt-7">{children}</div>
        </Card>
      </motion.div>
    </div>
  );
}
