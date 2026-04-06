import { memo } from "react";
import { History, Loader2, Save, Share2, Tag, Upload } from "lucide-react";

import { cn } from "@/shared/lib/utils";

import type { AgentStatus } from "../types";

interface AgentVersionToolbarProps {
  agentStatus: AgentStatus;
  isCanvasDirty: boolean;
  isCanvasSaving: boolean;
  onSaveCanvas: () => void;
  onOpenCreateVersion: () => void;
  onOpenVersionHistory: () => void;
  onOpenPublish: (versionId?: string) => void;
  onShare?: () => void;
  className?: string;
}

const statusConfig: Record<AgentStatus, { label: string; className: string }> =
  {
    draft: {
      label: "草稿",
      className: "border-sky-200 bg-sky-50 text-sky-700",
    },
    published: {
      label: "已发布",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    archived: {
      label: "已归档",
      className: "border-gray-200 bg-gray-100 text-gray-500",
    },
  };

export const AgentVersionToolbar = memo(function AgentVersionToolbar({
  agentStatus,
  isCanvasDirty,
  isCanvasSaving,
  onSaveCanvas,
  onOpenCreateVersion,
  onOpenVersionHistory,
  onOpenPublish,
  onShare,
  className,
}: AgentVersionToolbarProps) {
  const isArchived = agentStatus === "archived";
  const config = statusConfig[agentStatus];

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-1.5",
        className,
      )}
      data-testid="agent-version-toolbar"
    >
      <span
        className={cn(
          "rounded-full border px-2.5 py-0.5 text-xs font-medium",
          config.className,
        )}
        data-testid="agent-status-badge"
      >
        {config.label}
      </span>

      <div className="mx-1 h-4 w-px bg-border" />

      {!isArchived && (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onSaveCanvas}
          disabled={isCanvasSaving || !isCanvasDirty}
          data-testid="btn-save-agent-canvas"
        >
          {isCanvasSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {isCanvasSaving ? "保存中…" : "保存画布"}
        </button>
      )}

      {!isArchived && (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted"
          onClick={onOpenCreateVersion}
          data-testid="btn-create-agent-version"
        >
          <Tag className="h-3.5 w-3.5" />
          保存版本
        </button>
      )}

      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted"
        onClick={onOpenVersionHistory}
        data-testid="btn-agent-version-history"
      >
        <History className="h-3.5 w-3.5" />
        历史记录
      </button>

      {!isArchived && (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700"
          onClick={() => onOpenPublish()}
          data-testid="btn-publish-agent"
        >
          <Upload className="h-3.5 w-3.5" />
          发布
        </button>
      )}

      {onShare && (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted"
          onClick={onShare}
          data-testid="btn-share-agent"
        >
          <Share2 className="h-3.5 w-3.5" />
          分享
        </button>
      )}
    </div>
  );
});
