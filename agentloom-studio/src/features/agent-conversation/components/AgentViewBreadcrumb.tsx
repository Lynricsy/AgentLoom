import { memo, useCallback } from "react";
import { ArrowLeft, Bot, ChevronRight } from "lucide-react";
import { Button } from "@/shared/ui/button";

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
      <Button
        variant="ghost"
        size="xs"
        onClick={handleBack}
        className="px-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft />
        返回
      </Button>

      <div className="flex items-center gap-1 overflow-hidden">
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1;
          const isFirst = i === 0;
          return (
            <div key={seg.index} className="flex items-center gap-1 min-w-0">
              {i > 0 && (
                <ChevronRight className="size-3 shrink-0 text-muted-foreground/40" />
              )}
              {isFirst && (
                <Bot
                  className="size-3 shrink-0"
                  style={{ color: "var(--color-node-agent)" }}
                />
              )}
              {isLast ? (
                <span className="truncate text-xs font-medium text-foreground">
                  {seg.label}
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => onNavigate(seg.index)}
                  className="h-auto min-w-0 px-0 py-0 text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
                >
                  <span className="truncate">{seg.label}</span>
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
