import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  FolderTree,
  HardDrive,
  PackageOpen,
} from "lucide-react";
import { WorkspaceFileTree } from "@/features/agent-conversation";
import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import { PageHeader } from "@/shared/components/page-header/PageHeader";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  useWorkspaceDetail,
  useWorkspaceFilePreview,
  useWorkspaceFileTree,
} from "../api/workspaceQueries";
import { formatWorkspaceSize } from "../lib/formatSize";
import {
  WORKSPACE_SOURCE_LABEL,
  WORKSPACE_SOURCE_TONE,
} from "../lib/workspacePresentation";
import { WorkspaceFilePreviewPanel } from "./WorkspaceFilePreviewPanel";
import type { WorkspaceFileNode } from "../types";

interface WorkspaceDetailPageProps {
  workspaceId: string;
}

const STATUS_LABEL: Record<string, string> = {
  ready: "就绪",
  creating: "创建中",
  archived: "已归档",
  deleted: "已删除",
};

function hasPath(nodes: WorkspaceFileNode[], path: string | null): boolean {
  if (!path) {
    return false;
  }

  for (const node of nodes) {
    if (node.path === path) {
      return true;
    }

    if (node.children && hasPath(node.children, path)) {
      return true;
    }
  }

  return false;
}

export function WorkspaceDetailPage({ workspaceId }: WorkspaceDetailPageProps) {
  const navigate = useNavigate();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const detailQuery = useWorkspaceDetail(workspaceId);
  const treeQuery = useWorkspaceFileTree(workspaceId);
  const previewQuery = useWorkspaceFilePreview(workspaceId, selectedPath);

  const workspace = detailQuery.data;
  const tree = useMemo(() => treeQuery.data ?? [], [treeQuery.data]);

  useEffect(() => {
    setSelectedPath((current) => (hasPath(tree, current) ? current : null));
  }, [tree]);

  const sourceKind = workspace?.sourceKind ?? "manual";
  const workspaceError = useMemo(() => {
    if (!detailQuery.isError) return null;
    return detailQuery.error instanceof Error
      ? detailQuery.error.message
      : "加载工作区详情失败";
  }, [detailQuery.error, detailQuery.isError]);

  const treeError = useMemo(() => {
    if (!treeQuery.isError) return null;
    return treeQuery.error instanceof Error
      ? treeQuery.error.message
      : "加载工作区文件树失败";
  }, [treeQuery.error, treeQuery.isError]);

  const previewError = useMemo(() => {
    if (!previewQuery.isError) return null;
    return previewQuery.error instanceof Error
      ? previewQuery.error.message
      : "加载文件预览失败";
  }, [previewQuery.error, previewQuery.isError]);

  if (detailQuery.isLoading) {
    return (
      <div className="flex h-full flex-col gap-5 p-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
        <Skeleton className="min-h-0 flex-1" />
      </div>
    );
  }

  if (!workspace || workspaceError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={AlertCircle}
          tone="var(--color-error)"
          title={workspaceError ?? "工作区不存在"}
          description="该工作区可能已被删除，或你没有访问权限。"
          action={
            <Button
              variant="outline"
              onClick={() => void navigate({ to: "/resources/workspaces" })}
            >
              返回列表
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-5 p-6">
      <PageHeader
        icon={PackageOpen}
        tone="var(--color-type-volume)"
        breadcrumb={[
          { label: "工作区", to: "/resources/workspaces" },
          { label: workspace.name },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {workspace.name}
            <Badge size="sm" tone={WORKSPACE_SOURCE_TONE[sourceKind]}>
              {WORKSPACE_SOURCE_LABEL[sourceKind]}
            </Badge>
          </span>
        }
        description={workspace.description || undefined}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void navigate({ to: "/resources/workspaces" })}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <DetailStat
          icon={<HardDrive className="h-4 w-4" />}
          tone="var(--color-type-volume)"
          label="大小"
          value={formatWorkspaceSize(workspace.sizeBytes)}
        />
        <DetailStat
          icon={<Calendar className="h-4 w-4" />}
          tone="var(--color-type-audio)"
          label="创建时间"
          value={new Date(workspace.createdAt).toLocaleString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        />
        <DetailStat
          icon={<FolderTree className="h-4 w-4" />}
          tone="var(--color-type-text)"
          label="状态"
          value={STATUS_LABEL[workspace.status] ?? workspace.status}
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-h-[320px] xl:min-h-0">
          <WorkspaceFileTree
            tree={tree}
            selectedPath={selectedPath}
            onSelectFile={setSelectedPath}
            isLoading={treeQuery.isLoading}
          />
          {treeError && <p className="mt-2 text-xs text-error">{treeError}</p>}
        </div>

        <div className="min-h-[320px] xl:min-h-0">
          <WorkspaceFilePreviewPanel
            workspaceId={workspaceId}
            selectedPath={selectedPath}
            preview={previewQuery.data ?? null}
            isLoading={previewQuery.isLoading}
            error={previewError}
          />
        </div>
      </div>
    </div>
  );
}

function DetailStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3">
      <div className="mb-1 flex items-center gap-2 text-xs text-muted">
        <span style={{ color: tone }}>{icon}</span>
        <span>{label}</span>
      </div>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
