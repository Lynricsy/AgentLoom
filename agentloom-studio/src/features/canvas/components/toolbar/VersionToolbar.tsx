import { memo, useCallback, useState } from "react";
import {
  Save,
  History,
  Upload,
  Archive,
  Play,
  Loader2,
  Clock3,
  ShieldAlert,
  SlidersHorizontal,
  Store,
  Download,
  FolderInput,
  Share2,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Badge, type BadgeProps } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { TooltipHint, TooltipProvider } from "@/shared/ui/tooltip";
import type { WorkflowStatus } from "@/features/workflow";
import { CreateVersionDialog } from "@/features/workflow";
import { ArchiveDialog } from "@/features/workflow";

interface VersionToolbarProps {
  workflowId: string;
  workflowStatus: WorkflowStatus;
  onOpenVersionHistory: () => void;
  onOpenPublish: (versionId?: string) => void;
  onToggleInterventionPolicies?: () => void;
  onToggleInputSchema?: () => void;
  onToggleTriggers?: () => void;
  onPublishToMarketplace?: () => void;
  onRun?: () => void;
  onExport?: () => void;
  onImport?: () => void;
  onShare?: () => void;
  isInterventionPoliciesOpen?: boolean;
  isInputSchemaOpen?: boolean;
  isTriggersOpen?: boolean;
  isRunning?: boolean;
  isExporting?: boolean;
  hasNodes?: boolean;
  className?: string;
}

const statusConfig: Record<
  WorkflowStatus,
  { label: string; variant: BadgeProps["variant"] }
> = {
  draft: { label: "草稿", variant: "info" },
  published: { label: "已发布", variant: "success" },
  archived: { label: "已归档", variant: "secondary" },
};

/** 面板开关按钮：开启态用品牌色轻底强调 */
const TOGGLE_ACTIVE_CLASS =
  "border-primary/25 bg-primary/10 text-primary hover:bg-primary/15";

export const VersionToolbar = memo(function VersionToolbar({
  workflowId,
  workflowStatus,
  onOpenVersionHistory,
  onOpenPublish,
  onToggleInterventionPolicies,
  onToggleInputSchema,
  onToggleTriggers,
  onPublishToMarketplace,
  onRun,
  onExport,
  onImport,
  onShare,
  isInterventionPoliciesOpen = false,
  isInputSchemaOpen = false,
  isTriggersOpen = false,
  isRunning = false,
  isExporting = false,
  hasNodes = false,
  className,
}: VersionToolbarProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const isArchived = workflowStatus === "archived";
  const isPublished = workflowStatus === "published";
  const canPublish = workflowStatus === "draft";
  const canArchive = !isArchived;

  const handleOpenCreate = useCallback(() => setCreateOpen(true), []);
  const handleOpenArchive = useCallback(() => setArchiveOpen(true), []);

  const config = statusConfig[workflowStatus];

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "flex flex-wrap items-center justify-end gap-1 rounded-panel border border-border bg-surface/90 px-2 py-1.5 shadow-popover backdrop-blur-sm",
          className,
        )}
        data-testid="version-toolbar"
      >
        <Badge
          variant={config.variant}
          size="sm"
          className="mx-1"
          data-testid="workflow-status-badge"
        >
          {config.label}
        </Badge>

        <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />

        {!isArchived && (
          <TooltipHint label="保存当前画布为版本快照">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="保存快照"
              onClick={handleOpenCreate}
              data-testid="btn-create-version"
            >
              <Save className="h-4 w-4" />
            </Button>
          </TooltipHint>
        )}

        <TooltipHint label="版本历史记录">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="历史记录"
            onClick={onOpenVersionHistory}
            data-testid="btn-version-history"
          >
            <History className="h-4 w-4" />
          </Button>
        </TooltipHint>

        {hasNodes && onExport && (
          <TooltipHint label="导出工作流 JSON">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="导出"
              onClick={onExport}
              disabled={isExporting}
              data-testid="btn-export-workflow"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </Button>
          </TooltipHint>
        )}

        {onImport && (
          <TooltipHint label="导入工作流 JSON">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="导入"
              onClick={onImport}
              data-testid="btn-import-workflow"
            >
              <FolderInput className="h-4 w-4" />
            </Button>
          </TooltipHint>
        )}

        {isPublished && onShare && (
          <TooltipHint label="分享工作流">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="分享"
              onClick={onShare}
              data-testid="btn-share-workflow"
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </TooltipHint>
        )}

        {canArchive && (
          <TooltipHint label="归档工作流">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="归档"
              onClick={handleOpenArchive}
              className={cn(isPublished && "text-warning hover:text-warning")}
              data-testid="btn-archive"
            >
              <Archive className="h-4 w-4" />
            </Button>
          </TooltipHint>
        )}

        {(onToggleInterventionPolicies ||
          onToggleInputSchema ||
          onToggleTriggers) && (
          <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
        )}

        {onToggleInterventionPolicies && (
          <Button
            variant="outline"
            size="sm"
            className={cn(isInterventionPoliciesOpen && TOGGLE_ACTIVE_CLASS)}
            onClick={onToggleInterventionPolicies}
            data-testid="btn-intervention-policies"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            {isInterventionPoliciesOpen ? "隐藏介入策略" : "介入策略"}
          </Button>
        )}

        {onToggleInputSchema && (
          <Button
            variant="outline"
            size="sm"
            className={cn(isInputSchemaOpen && TOGGLE_ACTIVE_CLASS)}
            onClick={onToggleInputSchema}
            data-testid="btn-input-schema"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {isInputSchemaOpen ? "隐藏输入参数" : "输入参数"}
          </Button>
        )}

        {onToggleTriggers && (
          <Button
            variant="outline"
            size="sm"
            className={cn(isTriggersOpen && TOGGLE_ACTIVE_CLASS)}
            onClick={onToggleTriggers}
            data-testid="btn-triggers"
          >
            <Clock3 className="h-3.5 w-3.5" />
            {isTriggersOpen ? "隐藏触发器" : "触发器"}
          </Button>
        )}

        {(canPublish || (isPublished && onPublishToMarketplace) || (!isArchived && onRun)) && (
          <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
        )}

        {isPublished && onPublishToMarketplace && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onPublishToMarketplace}
            data-testid="btn-publish-to-marketplace"
          >
            <Store className="h-3.5 w-3.5" />
            发布到市场
          </Button>
        )}

        {canPublish && (
          <Button
            size="sm"
            onClick={() => onOpenPublish()}
            data-testid="btn-publish"
          >
            <Upload className="h-3.5 w-3.5" />
            发布
          </Button>
        )}

        {!isArchived && onRun && (
          <Button
            size="sm"
            onClick={onRun}
            disabled={isRunning}
            data-testid="btn-run-workflow"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                执行中
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                运行
              </>
            )}
          </Button>
        )}
      </div>

      <CreateVersionDialog
        open={createOpen}
        workflowId={workflowId}
        onOpenChange={setCreateOpen}
      />
      <ArchiveDialog
        open={archiveOpen}
        workflowId={workflowId}
        onOpenChange={setArchiveOpen}
      />
    </TooltipProvider>
  );
});
