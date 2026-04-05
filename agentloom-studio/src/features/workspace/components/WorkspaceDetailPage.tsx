import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Calendar,
  FolderTree,
  HardDrive,
  Loader2,
  PackageOpen,
} from "lucide-react";
import { WorkspaceFileTree } from "@/features/agent-conversation";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import {
  useWorkspaceDetail,
  useWorkspaceFilePreview,
  useWorkspaceFileTree,
} from "../api/workspaceQueries";
import { formatWorkspaceSize } from "../lib/formatSize";
import { WorkspaceFilePreviewPanel } from "./WorkspaceFilePreviewPanel";
import type { WorkspaceFileNode } from "../types";

interface WorkspaceDetailPageProps {
  workspaceId: string;
}

const SOURCE_LABEL: Record<string, string> = {
  manual: "常规",
  sandbox_snapshot: "沙箱快照",
  execution_archive: "执行归档",
};

const SOURCE_BADGE: Record<string, string> = {
  manual: "bg-slate-500/10 text-slate-300",
  sandbox_snapshot: "bg-blue-500/10 text-blue-400",
  execution_archive: "bg-amber-500/10 text-amber-400",
};

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

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WorkspaceDetailPage({ workspaceId }: WorkspaceDetailPageProps) {
  const navigate = useNavigate();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const detailQuery = useWorkspaceDetail(workspaceId);
  const treeQuery = useWorkspaceFileTree(workspaceId);
  const previewQuery = useWorkspaceFilePreview(workspaceId, selectedPath);

  const workspace = detailQuery.data;
  const tree = treeQuery.data ?? [];

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
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workspace || workspaceError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">
          {workspaceError ?? "工作区不存在"}
        </p>
        <Button
          variant="outline"
          onClick={() => void navigate({ to: "/resources/workspaces" })}
        >
          返回列表
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void navigate({ to: "/resources/workspaces" })}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回
        </Button>
      </div>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <PackageOpen className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">
                {workspace.name}
              </h1>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                  SOURCE_BADGE[sourceKind],
                )}
              >
                {SOURCE_LABEL[sourceKind]}
              </span>
            </div>
            {workspace.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {workspace.description}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <DetailStat
            icon={<HardDrive className="h-4 w-4 text-emerald-400" />}
            label="大小"
            value={formatWorkspaceSize(workspace.sizeBytes)}
          />
          <DetailStat
            icon={<Calendar className="h-4 w-4 text-orange-400" />}
            label="创建时间"
            value={formatDateTime(workspace.createdAt)}
          />
          <DetailStat
            icon={<FolderTree className="h-4 w-4 text-blue-400" />}
            label="状态"
            value={STATUS_LABEL[workspace.status] ?? workspace.status}
          />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-h-[320px] xl:min-h-0">
          <WorkspaceFileTree
            tree={tree}
            selectedPath={selectedPath}
            onSelectFile={setSelectedPath}
          />
          {treeQuery.isLoading && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>正在加载文件树…</span>
            </div>
          )}
          {treeError && (
            <p className="mt-2 text-xs text-muted-foreground">{treeError}</p>
          )}
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
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
