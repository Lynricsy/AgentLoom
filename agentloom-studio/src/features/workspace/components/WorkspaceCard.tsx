import { memo, useState } from "react";
import { MoreVertical, Trash2, FolderOpen, Eye } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { formatRelativeTime } from "@/features/canvas";
import { cn } from "@/shared/lib/utils";
import type { Workspace } from "../types";
import { formatWorkspaceSize } from "../lib/formatSize";

interface WorkspaceCardProps {
  workspace: Workspace;
  onDelete: (workspace: Workspace) => void;
  onOpen: (workspace: Workspace) => void;
}

const STATUS_BADGE: Record<string, string> = {
  ready: "bg-emerald-500/10 text-emerald-500",
  creating: "bg-amber-500/10 text-amber-500",
  archived: "bg-neutral-500/10 text-neutral-500",
};

const STATUS_LABEL: Record<string, string> = {
  ready: "就绪",
  creating: "创建中",
  archived: "已归档",
};

const SOURCE_BADGE: Record<NonNullable<Workspace["sourceKind"]>, string> = {
  manual: "bg-slate-500/10 text-slate-300",
  sandbox_snapshot: "bg-blue-500/10 text-blue-400",
  execution_archive: "bg-amber-500/10 text-amber-400",
};

const SOURCE_LABEL: Record<NonNullable<Workspace["sourceKind"]>, string> = {
  manual: "常规",
  sandbox_snapshot: "沙箱快照",
  execution_archive: "执行归档",
};

function CardActions({
  workspace,
  onDelete,
}: {
  workspace: Workspace;
  onDelete: (workspace: Workspace) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
            role="button"
            tabIndex={-1}
            aria-label="关闭菜单"
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border border-border bg-card py-1 shadow-xl">
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/10"
              onClick={() => {
                onDelete(workspace);
                setOpen(false);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export const WorkspaceCard = memo(function WorkspaceCard({
  workspace,
  onDelete,
  onOpen,
}: WorkspaceCardProps) {
  const statusKey =
    workspace.status === "creating"
      ? "creating"
      : workspace.status === "archived"
        ? "archived"
        : "ready";
  const sourceKind = workspace.sourceKind ?? "manual";

  return (
    <article className="group relative rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <FolderOpen className="h-4 w-4" />
          </div>
          <h2 className="truncate text-sm font-semibold text-foreground">
            {workspace.name}
          </h2>
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
              STATUS_BADGE[statusKey],
            )}
          >
            {STATUS_LABEL[statusKey]}
          </span>
        </div>
        <CardActions workspace={workspace} onDelete={onDelete} />
      </div>

      {/* Description */}
      {workspace.description && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
          {workspace.description}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
            SOURCE_BADGE[sourceKind],
          )}
        >
          {SOURCE_LABEL[sourceKind]}
        </span>
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
        <span>{formatWorkspaceSize(workspace.sizeBytes)}</span>
        <span>创建于 {formatRelativeTime(new Date(workspace.createdAt))}</span>
      </div>

      <div className="mt-4 flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={() => onOpen(workspace)}>
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          预览
        </Button>
      </div>
    </article>
  );
});
