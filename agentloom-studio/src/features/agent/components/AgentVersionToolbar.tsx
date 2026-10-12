import { memo } from "react";
import { History, KeyRound, Loader2, Save, Share2, Tag, Upload } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";
import { StatusBadge } from "@/shared/ui/status-badge";

import { AGENT_STATUS_META } from "../lib/status";
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
  /** 传入时显示「API 访问」入口；是否可见由调用方按角色决定 */
  onOpenApiAccess?: () => void;
  /** 只读浏览（小屏）：只保留状态徽章与历史记录等查看类入口 */
  isReadOnly?: boolean;
  className?: string;
}

export const AgentVersionToolbar = memo(function AgentVersionToolbar({
  agentStatus,
  isCanvasDirty,
  isCanvasSaving,
  onSaveCanvas,
  onOpenCreateVersion,
  onOpenVersionHistory,
  onOpenPublish,
  onShare,
  onOpenApiAccess,
  isReadOnly = false,
  className,
}: AgentVersionToolbarProps) {
  /** 归档与小屏只读浏览都不应暴露写操作入口 */
  const hideWriteActions = agentStatus === "archived" || isReadOnly;
  const status = AGENT_STATUS_META[agentStatus];

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-1.5",
        className,
      )}
      data-testid="agent-version-toolbar"
    >
      {/* 徽章与分隔线成组不拆行，避免换行时竖线孤立在行首/行尾 */}
      <div className="flex shrink-0 items-center gap-1.5">
        <StatusBadge tone={status.tone} data-testid="agent-status-badge">
          {status.label}
        </StatusBadge>
        <Separator orientation="vertical" className="mx-1 h-4" />
      </div>

      {!hideWriteActions && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onSaveCanvas}
          disabled={isCanvasSaving || !isCanvasDirty}
          data-testid="btn-save-agent-canvas"
        >
          {isCanvasSaving ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Save />
          )}
          {isCanvasSaving ? "保存中…" : "保存画布"}
        </Button>
      )}

      {!hideWriteActions && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onOpenCreateVersion}
          data-testid="btn-create-agent-version"
        >
          <Tag />
          保存版本
        </Button>
      )}

      <Button
        variant="secondary"
        size="sm"
        onClick={onOpenVersionHistory}
        data-testid="btn-agent-version-history"
      >
        <History />
        历史记录
      </Button>

      {!hideWriteActions && (
        <Button
          size="sm"
          className="bg-success text-white hover:bg-success/90"
          onClick={() => onOpenPublish()}
          data-testid="btn-publish-agent"
        >
          <Upload />
          发布
        </Button>
      )}

      {onShare && !hideWriteActions && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onShare}
          data-testid="btn-share-agent"
        >
          <Share2 />
          分享
        </Button>
      )}

      {onOpenApiAccess && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onOpenApiAccess}
          data-testid="btn-agent-api-access"
        >
          <KeyRound />
          API 访问
        </Button>
      )}
    </div>
  );
});
