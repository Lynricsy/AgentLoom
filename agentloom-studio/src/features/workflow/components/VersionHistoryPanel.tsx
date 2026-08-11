import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  History,
  X,
  RotateCcw,
  Upload,
  Clock,
  Tag,
  Loader2,
  Archive,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { formatRelativeTime } from "@/features/canvas/lib/formatRelativeTime";
import type { WorkflowStatus, WorkflowVersion } from "../types";
import { useWorkflowVersions } from "../api/versionQueries";
import { useRollbackVersion } from "../api/versionMutations";
import { useToast } from "@/shared/ui/toast";

interface VersionHistoryPanelProps {
  open: boolean;
  workflowId: string;
  workflowStatus: WorkflowStatus;
  onClose: () => void;
  onPublish?: (versionId: string) => void;
}

function formatCreatorLabel(createdBy: string): string {
  const trimmed = createdBy.trim();
  return trimmed.length > 0 ? trimmed : "未知创建者";
}

function formatCreatorInitial(createdBy: string): string {
  return formatCreatorLabel(createdBy).slice(0, 1).toUpperCase();
}

function getReleaseNumber(version: WorkflowVersion): number | null {
  if (typeof version.releaseNumber === "number") {
    return version.releaseNumber;
  }

  return version.publishedAt ? 1 : null;
}

function formatVersionRecordLabel(version: WorkflowVersion): string {
  const releaseNumber = getReleaseNumber(version);
  if (releaseNumber !== null) {
    return `v${releaseNumber}`;
  }

  return `快照 #${version.versionNumber}`;
}

function formatHistoryRecordLabel(version: WorkflowVersion): string {
  const releaseNumber = getReleaseNumber(version);
  if (releaseNumber !== null) {
    return `版本 ${formatVersionRecordLabel(version)}`;
  }

  return `快照 #${version.versionNumber}`;
}

function VersionItemSkeleton() {
  return (
    <div className="border-b border-border p-4" data-testid="version-item-skeleton">
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-10 rounded" />
        <Skeleton className="h-4 w-32 rounded" />
      </div>
      <Skeleton className="mt-2 h-3 w-24 rounded" />
    </div>
  );
}

interface VersionItemProps {
  version: WorkflowVersion;
  workflowStatus: WorkflowStatus;
  onRollback: (version: WorkflowVersion) => void;
  onPublish?: (versionId: string) => void;
  isRollingBack: boolean;
}

const VersionItem = memo(function VersionItem({
  version,
  workflowStatus,
  onRollback,
  onPublish,
  isRollingBack,
}: VersionItemProps) {
  const isPublished = !!version.publishedAt;
  const isArchived = !!version.archivedAt;
  const isWorkflowArchived = workflowStatus === "archived";
  const creatorLabel = formatCreatorLabel(version.createdBy);
  const releaseNotes = version.snapshot?.metadata?.releaseNotes?.trim() ?? "";
  const releaseNumber = getReleaseNumber(version);
  const isReleased = releaseNumber !== null;
  const publishActionLabel = isReleased ? "重新发布" : "发布";

  return (
    <div
      className="group border-b border-border p-4 transition-colors hover:bg-surface-elevated"
      data-testid={`version-item-${version.versionNumber}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={isReleased ? "default" : "secondary"} className="rounded-md">
            {formatVersionRecordLabel(version)}
          </Badge>
          {version.label && (
            <span className="flex items-center gap-1 text-sm text-foreground">
              <Tag className="h-3 w-3" />
              {version.label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isPublished && <Badge variant="success">当前发布</Badge>}
          {!isPublished && isReleased && <Badge variant="info">历史发布</Badge>}
          {isArchived && (
            <Badge variant="secondary">
              <Archive className="h-3 w-3" />
              已归档
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <span className="flex items-center gap-1 text-xs text-muted">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(new Date(version.createdAt))}
          </span>

          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
              {formatCreatorInitial(version.createdBy)}
            </span>
            <span data-testid={`version-created-by-${version.versionNumber}`}>
              {creatorLabel}
            </span>
          </div>

          {version.snapshot?.metadata && (
            <div className="text-xs text-muted">
              {version.snapshot.metadata.nodeCount} 个节点 ·{" "}
              {version.snapshot.metadata.edgeCount} 条连线
            </div>
          )}

          {releaseNotes && (
            <p className="rounded-card border border-border bg-surface-elevated px-3 py-2 text-xs leading-5 text-foreground">
              {releaseNotes}
            </p>
          )}
        </div>

        {!isWorkflowArchived && (
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            {!isPublished && !isArchived && onPublish && (
              <Button
                variant="ghost"
                size="sm"
                className="text-primary hover:bg-primary/10"
                onClick={() => onPublish(version.id)}
                data-testid={`publish-version-${version.versionNumber}`}
              >
                <Upload className="h-3 w-3" />
                {publishActionLabel}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-warning hover:bg-warning/10"
              onClick={() => onRollback(version)}
              disabled={isRollingBack}
              data-testid={`rollback-version-${version.versionNumber}`}
            >
              {isRollingBack ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="h-3 w-3" />
              )}
              回滚
            </Button>
          </div>
        )}
      </div>
    </div>
  );
});

export const VersionHistoryPanel = memo(function VersionHistoryPanel({
  open,
  workflowId,
  workflowStatus,
  onClose,
  onPublish,
}: VersionHistoryPanelProps) {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [rollbackTarget, setRollbackTarget] = useState<WorkflowVersion | null>(
    null,
  );
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useWorkflowVersions(workflowId, {
    page,
    pageSize,
  });
  const rollbackMutation = useRollbackVersion(workflowId);
  const { notify } = useToast();

  useEffect(() => {
    if (!open) {
      return;
    }

    setPage(1);
    setVersions([]);
    setRollbackTarget(null);
    setRollingBackId(null);
  }, [open]);

  useEffect(() => {
    if (!open || !data || data.meta.page !== page) {
      return;
    }

    setVersions((current) => {
      if (page === 1) {
        return data.data;
      }

      const existingIds = new Set(current.map((version) => version.id));
      return [
        ...current,
        ...data.data.filter((version) => !existingIds.has(version.id)),
      ];
    });
  }, [data, open, page]);

  const displayVersions = (() => {
    if (!open) {
      return versions;
    }

    if (versions.length > 0) {
      return versions;
    }

    if (page === 1 && data?.meta.page === 1) {
      return data.data;
    }

    return versions;
  })();

  const meta = data?.meta;
  const total = meta?.total ?? displayVersions.length;
  const hasMorePages = (meta?.totalPages ?? 1) > page;
  const isInitialLoading = isLoading && displayVersions.length === 0;
  const footerLabel = useMemo(() => {
    if (displayVersions.length === 0) {
      return null;
    }

    if (hasMorePages) {
      return "继续向下滚动加载更多";
    }

    return "已加载全部版本";
  }, [displayVersions.length, hasMorePages]);

  const handleRollback = useCallback((version: WorkflowVersion) => {
    setRollbackTarget(version);
  }, []);

  const confirmRollback = useCallback(async () => {
    if (!rollbackTarget) return;

    setRollingBackId(rollbackTarget.id);
    try {
      await rollbackMutation.mutateAsync(rollbackTarget.id);
      notify({
        title: "回滚成功",
        description: `已回滚到${formatHistoryRecordLabel(rollbackTarget)}${rollbackTarget.label ? `（${rollbackTarget.label}）` : ""}`,
        variant: "success",
      });
      setRollbackTarget(null);
    } catch {
      notify({
        title: "回滚失败",
        description: "请稍后重试",
        variant: "error",
      });
    } finally {
      setRollingBackId(null);
    }
  }, [rollbackTarget, rollbackMutation, notify]);

  const cancelRollback = useCallback(() => {
    setRollbackTarget(null);
  }, []);

  const handleListScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (!hasMorePages || isFetching) {
        return;
      }

      const target = event.currentTarget;
      const remainingDistance =
        target.scrollHeight - target.scrollTop - target.clientHeight;

      if (remainingDistance <= 96) {
        setPage((currentPage) => currentPage + 1);
      }
    },
    [hasMorePages, isFetching],
  );

  return (
    <aside
      className={cn(
        "fixed right-0 top-0 z-40 flex h-full w-[min(400px,100vw)] flex-col border-l border-border bg-surface shadow-panel transition-transform duration-300",
        open ? "translate-x-0" : "translate-x-full",
      )}
      data-testid="version-history-panel"
      aria-label="历史记录"
    >
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted" />
          <h2 className="text-sm font-medium text-foreground">历史记录</h2>
          {total > 0 && <span className="text-xs text-muted">({total})</span>}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="关闭历史记录"
          data-testid="close-version-history"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* 回滚确认 */}
      {rollbackTarget && (
        <div
          className="border-b border-warning/25 bg-warning/5 p-4"
          data-testid="rollback-confirm"
        >
          <p className="text-sm text-foreground">
            确定要回滚到{formatHistoryRecordLabel(rollbackTarget)}
            {rollbackTarget.label ? `（${rollbackTarget.label}）` : ""}
            吗？当前未保存的更改将丢失。
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              className="bg-warning text-white hover:bg-warning/90"
              onClick={confirmRollback}
              disabled={!!rollingBackId}
              data-testid="confirm-rollback"
            >
              {rollingBackId ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="h-3 w-3" />
              )}
              确认回滚
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={cancelRollback}
              data-testid="cancel-rollback"
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {/* 版本列表 */}
      <div className="flex-1 overflow-y-auto">
        {isInitialLoading ? (
          <div data-testid="version-list-loading">
            <VersionItemSkeleton />
            <VersionItemSkeleton />
            <VersionItemSkeleton />
          </div>
        ) : displayVersions.length === 0 ? (
          <div className="p-4" data-testid="version-list-empty">
            <EmptyState
              icon={History}
              title="暂无发布记录或快照"
              description="保存快照或发布当前画布后，会在这里展示历史记录"
            />
          </div>
        ) : (
          <div
            data-testid="version-list"
            onScroll={handleListScroll}
            className="h-full overflow-y-auto"
          >
            {displayVersions.map((version) => (
              <VersionItem
                key={version.id}
                version={version}
                workflowStatus={workflowStatus}
                onRollback={handleRollback}
                onPublish={onPublish}
                isRollingBack={rollingBackId === version.id}
              />
            ))}
            {isFetching && hasMorePages && (
              <div
                className="flex items-center justify-center gap-2 py-4 text-xs text-muted"
                data-testid="version-list-loading-more"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                正在加载更多版本...
              </div>
            )}
          </div>
        )}
      </div>

      {footerLabel && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2">
          <span className="text-xs text-muted">
            已加载 {displayVersions.length}/{total} 条记录
          </span>
          <span className="text-xs text-muted">{footerLabel}</span>
        </div>
      )}
    </aside>
  );
});
