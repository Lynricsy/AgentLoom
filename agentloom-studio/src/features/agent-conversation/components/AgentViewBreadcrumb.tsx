import { memo, useCallback } from "react";
import { ArrowLeft, Bot, ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface AgentViewBreadcrumbProps {
  agentName: string;
  viewStack: string[];
  labelsByHandle: Record<string, string>;
  onNavigate: (index: number) => void;
}

export const AgentViewBreadcrumb = memo(function AgentViewBreadcrumb({
  agentName,
  viewStack,
  labelsByHandle,
  onNavigate,
}: AgentViewBreadcrumbProps) {
  const handleBack = useCallback(() => {
    onNavigate(viewStack.length - 1);
  }, [onNavigate, viewStack.length]);

  const segments = [
    { label: agentName, index: 0 },
    ...viewStack.map((handle, i) => ({
      label: labelsByHandle[handle] ?? handle,
      index: i + 1,
    })),
  ];

  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-1.5">
      <button
        type="button"
        onClick={handleBack}
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        返回
      </button>

      <div className="flex items-center gap-1 overflow-hidden">
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1;
          const isFirst = i === 0;
          return (
            <div key={seg.index} className="flex items-center gap-1 min-w-0">
              {i > 0 && (
                <ChevronRight className="size-3 shrink-0 text-muted-foreground/40" />
              )}
              {isFirst && <Bot className="size-3 shrink-0 text-purple-400" />}
              {isLast ? (
                <span className="truncate text-xs font-medium text-foreground">
                  {seg.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate(seg.index)}
                  className={cn(
                    "truncate text-xs text-muted-foreground transition-colors hover:text-foreground",
                    "cursor-pointer",
                  )}
                >
                  {seg.label}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
