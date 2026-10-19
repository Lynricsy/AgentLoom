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
  Undo2,
  Redo2,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { CANVAS_FLOATING_CLASS } from "../canvasChrome";
import { Badge, type BadgeProps } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Separator } from "@/shared/ui/separator";
import { TooltipHint, TooltipProvider } from "@/shared/ui/tooltip";
import type { WorkflowStatus } from "@/features/workflow";
import { CreateVersionDialog } from "@/features/workflow";
import { ArchiveDialog } from "@/features/workflow";
import { useCanvasActions, useCanvasHistory } from "../../stores/canvasStore";

const TOOLBAR_SEPARATOR_CLASS = "mx-0.5 h-5";

/** 撤销 / 重做：历史为空时禁用；快捷键见 useCanvasKeyboardShortcuts */
const CanvasHistoryButtons = memo(function CanvasHistoryButtons() {
  const { canUndo, canRedo } = useCanvasHistory();
  const { undo, redo } = useCanvasActions();

  return (
    <>
      <TooltipHint label="撤销（Ctrl/⌘+Z）">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="撤销"
          onClick={undo}
          disabled={!canUndo}
          data-testid="btn-canvas-undo"
        >
          <Undo2 />
        </Button>
      </TooltipHint>
      <TooltipHint label="重做（Shift+Ctrl/⌘+Z 或 Ctrl+Y）">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="重做"
          onClick={redo}
          disabled={!canRedo}
          data-testid="btn-canvas-redo"
        >
          <Redo2 />
        </Button>
      </TooltipHint>
      <Separator orientation="vertical" className={TOOLBAR_SEPARATOR_CLASS} />
    </>
  );
});

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

/** 带文字的工具条按钮收紧水平内边距：1366 宽画布下整条工具条才能单行放下 */
const TOOLBAR_TEXT_BUTTON_CLASS = "px-2.5";

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
  // 已发布的工作流仍可把当前草稿发布为新版本；只有归档后不可发布
  const canPublish = !isArchived;
  const canArchive = !isArchived;

  const handleOpenCreate = useCallback(() => setCreateOpen(true), []);
  const handleOpenArchive = useCallback(() => setArchiveOpen(true), []);

  const canExport = hasNodes && !!onExport;
  const canShare = isPublished && !!onShare;
  const hasMoreActions = canExport || !!onImport || canShare || canArchive;

  const config = statusConfig[workflowStatus];

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          CANVAS_FLOATING_CLASS,
          "flex flex-wrap items-center justify-end gap-1 px-2 py-1",
          className,
        )}
        data-testid="version-toolbar"
      >
        <Badge
          variant={config.variant}
          size="sm"
          className="mx-0.5"
          data-testid="workflow-status-badge"
        >
          {config.label}
        </Badge>

        <Separator orientation="vertical" className={TOOLBAR_SEPARATOR_CLASS} />

        {!isArchived && <CanvasHistoryButtons />}

        {!isArchived && (
          <TooltipHint label="保存当前画布为版本快照">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="保存快照"
              onClick={handleOpenCreate}
              data-testid="btn-create-version"
            >
              <Save />
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
            <History />
          </Button>
        </TooltipHint>

        {hasMoreActions && (
          <DropdownMenu>
            <TooltipHint label="更多操作">
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="更多操作"
                  data-testid="btn-toolbar-more"
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
            </TooltipHint>
            <DropdownMenuContent align="end" className="w-44">
              {canExport && (
                <DropdownMenuItem
                  onSelect={onExport}
                  disabled={isExporting}
                  data-testid="btn-export-workflow"
                >
                  {isExporting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  导出
                </DropdownMenuItem>
              )}
              {onImport && (
                <DropdownMenuItem
                  onSelect={onImport}
                  data-testid="btn-import-workflow"
                >
                  <FolderInput className="h-3.5 w-3.5" />
                  导入
                </DropdownMenuItem>
              )}
              {canShare && (
                <DropdownMenuItem
                  onSelect={onShare}
                  data-testid="btn-share-workflow"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  分享
                </DropdownMenuItem>
              )}
              {canArchive && (
                <DropdownMenuItem
                  onSelect={handleOpenArchive}
                  className={cn(isPublished && "text-warning")}
                  data-testid="btn-archive"
                >
                  <Archive className="h-3.5 w-3.5" />
                  归档
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {(onToggleInterventionPolicies ||
          onToggleInputSchema ||
          onToggleTriggers) && (
          <Separator orientation="vertical" className={TOOLBAR_SEPARATOR_CLASS} />
        )}

        {onToggleInterventionPolicies && (
          <Button
            variant="outline"
            size="sm"
            className={cn(TOOLBAR_TEXT_BUTTON_CLASS, isInterventionPoliciesOpen && TOGGLE_ACTIVE_CLASS)}
            aria-pressed={isInterventionPoliciesOpen}
            onClick={onToggleInterventionPolicies}
            data-testid="btn-intervention-policies"
          >
            <ShieldAlert />
            介入策略
          </Button>
        )}

        {onToggleInputSchema && (
          <Button
            variant="outline"
            size="sm"
            className={cn(TOOLBAR_TEXT_BUTTON_CLASS, isInputSchemaOpen && TOGGLE_ACTIVE_CLASS)}
            aria-pressed={isInputSchemaOpen}
            onClick={onToggleInputSchema}
            data-testid="btn-input-schema"
          >
            <SlidersHorizontal />
            输入参数
          </Button>
        )}

        {onToggleTriggers && (
          <Button
            variant="outline"
            size="sm"
            className={cn(TOOLBAR_TEXT_BUTTON_CLASS, isTriggersOpen && TOGGLE_ACTIVE_CLASS)}
            aria-pressed={isTriggersOpen}
            onClick={onToggleTriggers}
            data-testid="btn-triggers"
          >
            <Clock3 />
            触发器
          </Button>
        )}

        {(canPublish ||
          (isPublished && onPublishToMarketplace) ||
          (!isArchived && onRun)) && (
          <Separator orientation="vertical" className={TOOLBAR_SEPARATOR_CLASS} />
        )}

        {isPublished && onPublishToMarketplace && (
          <Button
            variant="secondary"
            size="sm"
            className={TOOLBAR_TEXT_BUTTON_CLASS}
            onClick={onPublishToMarketplace}
            data-testid="btn-publish-to-marketplace"
          >
            <Store />
            发布到市场
          </Button>
        )}

        {canPublish && (
          <Button
            size="sm"
            className={TOOLBAR_TEXT_BUTTON_CLASS}
            onClick={() => onOpenPublish()}
            data-testid="btn-publish"
          >
            <Upload />
            发布
          </Button>
        )}

        {!isArchived && onRun && (
          <Button
            size="sm"
            className={TOOLBAR_TEXT_BUTTON_CLASS}
            onClick={onRun}
            disabled={isRunning}
            data-testid="btn-run-workflow"
          >
            {isRunning ? (
              <>
                <Loader2 className="animate-spin" />
                执行中
              </>
            ) : (
              <>
                <Play />
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
