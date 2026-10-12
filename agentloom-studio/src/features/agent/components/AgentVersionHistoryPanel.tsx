import { memo, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Archive, Clock, History, Tag, Upload, X } from "lucide-react";

import { formatRelativeTime } from "@/features/canvas";
import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import { DUR, EASE } from "@/shared/lib/motion";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";

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
      className="border-b border-border p-4"
      data-testid="agent-version-item-skeleton"
    >
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-10 rounded-md" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="mt-2 h-3 w-24" />
      <Skeleton className="mt-2 h-5 w-40" />
      <Skeleton className="mt-2 h-3 w-28" />
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
      className="group border-b border-border p-4 transition-colors hover:bg-muted"
      data-testid={`agent-version-item-${version.versionNumber}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Badge size="sm" className="shrink-0">
            v{version.versionNumber}
          </Badge>
          {version.label && (
            <span
              className="flex min-w-0 items-center gap-1 text-sm text-foreground"
              title={version.label}
            >
              <Tag className="size-3 shrink-0" />
              <span className="truncate">{version.label}</span>
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {isPublished && <Badge variant="success">当前发布</Badge>}
          {isArchived && (
            <Badge variant="secondary">
              <Archive className="size-3" />
              已归档
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <Clock className="size-3 shrink-0" />
            {formatRelativeTime(new Date(version.createdAt))}
          </span>

          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-primary">
              {formatCreatorInitial(version.createdBy)}
            </span>
            <span
              className="min-w-0 truncate"
              data-testid={`agent-version-created-by-${version.versionNumber}`}
            >
              {formatCreatorLabel(version.createdBy)}
            </span>
          </div>

          <div className="text-xs text-muted-foreground tabular-nums">
            {version.snapshot.metadata.nodeCount} 个节点 ·{" "}
            {version.snapshot.metadata.edgeCount} 条连线
          </div>

          {releaseNotes && (
            <p className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted px-3 py-2 text-xs leading-5 text-foreground/80">
              {releaseNotes}
            </p>
          )}
        </div>

        {!isAgentArchived && !isPublished && !isArchived && onPublish && (
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
            <Button
              variant="ghost"
              size="xs"
              className="text-primary hover:bg-primary/10 hover:text-primary"
              onClick={() => onPublish(version.id)}
              data-testid={`publish-agent-version-${version.versionNumber}`}
            >
              <Upload />
              发布
            </Button>
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
    <AnimatePresence>
      {open ? (
        <motion.aside
          key="agent-version-history-panel"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: DUR.slow, ease: EASE }}
          className="fixed right-0 top-0 z-40 flex h-full w-[min(400px,100vw)] flex-col border-l border-border bg-surface shadow-xl"
          data-testid="agent-version-history-panel"
          aria-label="Agent 历史记录"
        >
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <History className="size-4 shrink-0 text-muted-foreground" />
              <h2 className="truncate text-sm font-medium">历史记录</h2>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={onClose}
              aria-label="关闭历史记录"
            >
              <X />
            </Button>
          </div>

          <div
            className="flex-1 overflow-y-auto"
            onScroll={handleListScroll}
            data-testid="agent-version-list-scroll"
          >
            {isLoading && page === 1 ? (
              <div>
                <VersionItemSkeleton />
                <VersionItemSkeleton />
                <VersionItemSkeleton />
              </div>
            ) : displayVersions.length === 0 ? (
              <div
                className="flex h-full items-center justify-center"
                data-testid="agent-version-list-empty"
              >
                <EmptyState
                  variant="plain"
                  icon={History}
                  title="暂无版本记录"
                  description="保存版本或发布当前 Agent 后，会在这里展示历史记录"
                />
              </div>
            ) : (
              <div data-testid="agent-version-list">
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
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
});
