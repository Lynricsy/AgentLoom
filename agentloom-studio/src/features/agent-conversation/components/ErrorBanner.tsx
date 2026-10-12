import { AnimatePresence, motion } from "motion/react";
import { AlertCircle } from "lucide-react";
import { expand } from "@/shared/lib/motion";

export interface ErrorBannerProps {
  /** 为空时横幅以高度过渡收起 */
  error: string | null | undefined;
  /** 错误前缀，如「连接错误」 */
  prefix?: string;
}

/** 对话页顶部的整行错误横幅（对话页与新对话草稿页共用），出现/消失走高度过渡，不硬推下方布局 */
export function ErrorBanner({ error, prefix }: ErrorBannerProps) {
  return (
    <AnimatePresence initial={false}>
      {error ? (
        <motion.div
          key="error-banner"
          {...expand}
          role="alert"
          className="shrink-0 overflow-hidden"
        >
          <div className="flex items-start gap-2 border-b border-error/20 bg-error/10 px-4 py-2 text-xs text-error">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0 whitespace-pre-wrap break-words">
              {prefix ? `${prefix}：` : null}
              {error}
            </span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
