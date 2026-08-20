import { memo, useEffect, useState } from "react";
import { Archive, Clock, History, Tag, Upload, X } from "lucide-react";

import { formatRelativeTime } from "@/features/canvas";
import { cn } from "@/shared/lib/utils";

import { useAgentVersions } from "../api/agentQueries";
import type { AgentStatus, AgentVersion } from "../types";

interface AgentVersionHistoryPanelProps {
  open: boolean;
  agentId: string;
  agentStatus: AgentStatus;
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

function VersionItemSkeleton() {
  return (
    <div
      className="animate-pulse border-b border-border p-4"
      data-testid="agent-version-item-skeleton"
    >
      <div className="flex items-center gap-2">
        <div className="h-5 w-10 rounded bg-muted" />
        <div className="h-4 w-32 rounded bg-muted" />
      </div>
      <div className="mt-2 h-3 w-24 rounded bg-muted" />
    </div>
  );
}

interface VersionItemProps {
  version: AgentVersion;
  agentStatus: AgentStatus;
  onPublish?: (versionId: string) => void;
}

const VersionItem = memo(function VersionItem({
  version,
  agentStatus,
  onPublish,
}: VersionItemProps) {
  const isPublished = !!version.publishedAt;
  const isArchived = !!version.archivedAt;
  const isAgentArchived = agentStatus === "archived";
  const releaseNotes = version.snapshot.metadata.releaseNotes?.trim() ?? "";

  return (
    <div
      className="group border-b border-border p-4 transition-colors hover:bg-muted/30"
      data-testid={`agent-version-item-${version.versionNumber}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            v{version.versionNumber}
          </span>
          {version.label && (
            <span className="flex items-center gap-1 text-sm text-foreground">
              <Tag className="h-3 w-3" />
              {version.label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isPublished && (
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
              当前发布
            </span>
          )}
          {isArchived && (
            <span className="inline-flex items-center rounded-full bg-gray-500/10 px-2 py-0.5 text-xs font-medium text-gray-500">
              <Archive className="mr-1 h-3 w-3" />
              已归档
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(new Date(version.createdAt))}
          </span>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 font-medium text-primary">
              {formatCreatorInitial(version.createdBy)}
            </span>
            <span
              data-testid={`agent-version-created-by-${version.versionNumber}`}
            >
              {formatCreatorLabel(version.createdBy)}
            </span>
          </div>

          <div className="text-xs text-muted-foreground">
            {version.snapshot.metadata.nodeCount} 个节点 ·{" "}
            {version.snapshot.metadata.edgeCount} 条连线
          </div>

          {releaseNotes && (
            <p className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-xs leading-5 text-foreground/80">
              {releaseNotes}
            </p>
          )}
        </div>

        {!isAgentArchived && !isPublished && !isArchived && onPublish && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-primary hover:bg-primary/10"
              onClick={() => onPublish(version.id)}
              data-testid={`publish-agent-version-${version.versionNumber}`}
            >
              <Upload className="h-3 w-3" />
              发布
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

export const AgentVersionHistoryPanel = memo(function AgentVersionHistoryPanel({
  open,
  agentId,
  agentStatus,
  onClose,
  onPublish,
}: AgentVersionHistoryPanelProps) {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [versions, setVersions] = useState<AgentVersion[]>([]);

  const { data, isLoading, isFetching } = useAgentVersions(agentId, {
    page,
    pageSize,
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    setPage(1);
    setVersions([]);
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

  const displayVersions = page === 1 && data ? data.data : versions;
  const hasMorePages = (data?.meta.totalPages ?? 0) > page;

  const handleListScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (!hasMorePages || isFetching) {
      return;
    }

    const target = event.currentTarget;
    const remainingDistance =
      target.scrollHeight - target.scrollTop - target.clientHeight;

    if (remainingDistance <= 96) {
      setPage((currentPage) => currentPage + 1);
    }
  };

  return (
    <aside
      className={cn(
        "fixed right-0 top-0 z-40 flex h-full w-[400px] flex-col border-l border-border bg-surface shadow-xl transition-transform duration-300",
        open ? "translate-x-0" : "translate-x-full",
      )}
      data-testid="agent-version-history-panel"
      aria-label="Agent 历史记录"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">历史记录</h2>
        </div>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onClose}
          aria-label="关闭历史记录"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && page === 1 ? (
          <div>
            <VersionItemSkeleton />
            <VersionItemSkeleton />
            <VersionItemSkeleton />
          </div>
        ) : displayVersions.length === 0 ? (
          <div
            className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground"
            data-testid="agent-version-list-empty"
          >
            <History className="h-8 w-8 opacity-40" />
            <p className="text-sm">暂无版本记录</p>
            <p className="text-xs">
              保存版本或发布当前 Agent 后，会在这里展示历史记录
            </p>
          </div>
        ) : (
          <div
            className="h-full overflow-y-auto"
            onScroll={handleListScroll}
            data-testid="agent-version-list"
          >
            {displayVersions.map((version) => (
              <VersionItem
                key={version.id}
                version={version}
                agentStatus={agentStatus}
                onPublish={onPublish}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
});
