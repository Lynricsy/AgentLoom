import { memo } from "react";
import { History, Loader2, Save, Share2, Tag, Upload } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Badge, type BadgeProps } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";

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

const STATUS_META: Record<
  AgentStatus,
  { label: string; variant: NonNullable<BadgeProps["variant"]> }
> = {
  draft: { label: "草稿", variant: "info" },
  published: { label: "已发布", variant: "success" },
  archived: { label: "已归档", variant: "secondary" },
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
  const status = STATUS_META[agentStatus];

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-1.5",
        className,
      )}
      data-testid="agent-version-toolbar"
    >
      <Badge variant={status.variant} data-testid="agent-status-badge">
        {status.label}
      </Badge>

      <Separator orientation="vertical" className="mx-1 h-4" />

      {!isArchived && (
        <Button
          variant="secondary"
          size="sm"
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
        </Button>
      )}

      {!isArchived && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onOpenCreateVersion}
          data-testid="btn-create-agent-version"
        >
          <Tag className="h-3.5 w-3.5" />
          保存版本
        </Button>
      )}

      <Button
        variant="secondary"
        size="sm"
        onClick={onOpenVersionHistory}
        data-testid="btn-agent-version-history"
      >
        <History className="h-3.5 w-3.5" />
        历史记录
      </Button>

      {!isArchived && (
        <Button
          size="sm"
          className="bg-success text-white hover:bg-success/90"
          onClick={() => onOpenPublish()}
          data-testid="btn-publish-agent"
        >
          <Upload className="h-3.5 w-3.5" />
          发布
        </Button>
      )}

      {onShare && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onShare}
          data-testid="btn-share-agent"
        >
          <Share2 className="h-3.5 w-3.5" />
          分享
        </Button>
      )}
    </div>
  );
});
