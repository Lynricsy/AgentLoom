import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  Eye,
  FolderOpen,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { formatRelativeTime } from "@/features/canvas";
import { DataTable, type DataTableColumn } from "@/shared/components/data-table/DataTable";
import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import { PageHeader } from "@/shared/components/page-header/PageHeader";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { useToast } from "@/shared/ui/toast";
import { useWorkspaces } from "../api/workspaceQueries";
import { useDeleteWorkspace } from "../api/workspaceMutations";
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog";
import { formatWorkspaceSize } from "../lib/formatSize";
import {
  WORKSPACE_SOURCE_LABEL,
  WORKSPACE_SOURCE_TONE,
} from "../lib/workspacePresentation";
import type { Workspace, WorkspaceListParams } from "../types";

const PAGE_SIZE = 20;

const STATUS_META: Record<
  Workspace["status"],
  { label: string; variant: "success" | "warning" | "secondary" | "error" }
> = {
  ready: { label: "就绪", variant: "success" },
  creating: { label: "创建中", variant: "warning" },
  archived: { label: "已归档", variant: "secondary" },
  deleted: { label: "已删除", variant: "error" },
};

export function WorkspaceManagementPage() {
  const navigate = useNavigate();
  const { notify } = useToast();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [showExecutionArchives, setShowExecutionArchives] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Workspace | null>(null);

  const deleteMutation = useDeleteWorkspace();

  const params = useMemo<WorkspaceListParams>(() => {
    const p: WorkspaceListParams = {
      page,
      pageSize: PAGE_SIZE,
      includeAutoArchived: showExecutionArchives,
    };
    if (search.trim()) p.search = search.trim();
    return p;
  }, [page, search, showExecutionArchives]);

  const { data, isLoading, isError, refetch } = useWorkspaces(params);
  const workspaces = data?.data ?? [];
  const meta = data?.meta;

  useEffect(() => {
    if (!isError) return;
    notify({
      title: "工作区列表加载失败",
      description: "请检查网络后重试。",
      variant: "error",
    });
  }, [isError, notify]);

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleDelete = useCallback((workspace: Workspace) => {
    setConfirmDelete(workspace);
  }, []);

  const handleOpenWorkspace = useCallback(
    (workspace: Workspace) => {
      void navigate({
        to: "/resources/workspaces/$workspaceId",
        params: { workspaceId: workspace.id },
      });
    },
    [navigate],
  );

  const handleConfirmDelete = useCallback(() => {
    if (!confirmDelete) return;
    deleteMutation.mutate(confirmDelete.id, {
      onSuccess: () => {
        setConfirmDelete(null);
        notify({
          title: "已删除",
          description: `已删除工作区「${confirmDelete.name}」。`,
          variant: "success",
        });
      },
      onError: (err) => {
        notify({
          title: "删除失败",
          description: err instanceof Error ? err.message : "请稍后重试。",
          variant: "error",
        });
      },
    });
  }, [confirmDelete, deleteMutation, notify]);

  const hasFilters = search.trim() !== "" || showExecutionArchives;

  const columns = useMemo<DataTableColumn<Workspace>[]>(
    () => [
      {
        key: "name",
        header: "工作区",
        cell: (workspace) => (
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="grid h-8 w-8 shrink-0 place-items-center rounded-card"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--color-type-volume) 14%, transparent)",
                color: "var(--color-type-volume)",
              }}
            >
              <FolderOpen className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {workspace.name}
              </p>
              <p className="truncate text-xs text-muted">
                {workspace.description || "暂无描述"}
              </p>
            </div>
          </div>
        ),
      },
      {
        key: "source",
        header: "来源",
        hideBelow: "md",
        className: "w-32",
        cell: (workspace) => {
          const sourceKind = workspace.sourceKind ?? "manual";
          return (
            <Badge size="sm" tone={WORKSPACE_SOURCE_TONE[sourceKind]}>
              {WORKSPACE_SOURCE_LABEL[sourceKind]}
            </Badge>
          );
        },
      },
      {
        key: "status",
        header: "状态",
        className: "w-24",
        cell: (workspace) => {
          const statusMeta = STATUS_META[workspace.status];
          return (
            <Badge size="sm" variant={statusMeta.variant}>
              {statusMeta.label}
            </Badge>
          );
        },
      },
      {
        key: "size",
        header: "大小",
        hideBelow: "sm",
        className: "w-24 tabular-nums",
        cell: (workspace) => formatWorkspaceSize(workspace.sizeBytes),
      },
      {
        key: "createdAt",
        header: "创建时间",
        hideBelow: "lg",
        className: "w-32",
        cell: (workspace) => formatRelativeTime(new Date(workspace.createdAt)),
      },
      {
        key: "actions",
        header: <span className="sr-only">操作</span>,
        className: "w-32 text-right",
        cell: (workspace) => (
          <div
            className="flex items-center justify-end gap-1"
            onClick={(event) => event.stopPropagation()}
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenWorkspace(workspace)}
            >
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              预览
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`删除工作区 ${workspace.name}`}
              className="text-muted hover:text-error"
              onClick={() => handleDelete(workspace)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    [handleDelete, handleOpenWorkspace],
  );

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
      <PageHeader
        icon={FolderOpen}
        tone="var(--color-type-volume)"
        title="工作区"
        description="管理 Agent 的持久化工作区存储"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            创建工作区
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索工作区..."
            className="pl-9"
          />
        </div>
        <Select
          value={showExecutionArchives ? "all" : "primary"}
          onValueChange={(value) => {
            setShowExecutionArchives(value === "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-44" aria-label="执行归档可见性">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="primary">隐藏执行归档</SelectItem>
            <SelectItem value="all">包含执行归档</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted">
        默认隐藏工作流执行自动归档出来的快照，仅展示可复用的手动工作区与沙箱快照。
      </p>

      {isError ? (
        <EmptyState
          icon={AlertCircle}
          tone="var(--color-error)"
          title="工作区列表加载失败"
          description="请稍后重试，或检查后端服务是否可用。"
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              重新加载
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={workspaces}
          rowKey={(workspace) => workspace.id}
          loading={isLoading}
          onRowClick={handleOpenWorkspace}
          empty={
            <EmptyState
              icon={FolderOpen}
              tone="var(--color-type-volume)"
              title={hasFilters ? "没有匹配的工作区" : "暂无工作区"}
              description={
                hasFilters
                  ? "换个关键词，或调整执行归档的可见性。"
                  : "工作区用于持久化 Agent 的文件产出，创建后可在执行中挂载。"
              }
              action={
                hasFilters ? null : (
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    创建工作区
                  </Button>
                )
              }
            />
          }
          pagination={
            meta
              ? {
                  page: meta.page,
                  pageSize: meta.pageSize,
                  total: meta.total,
                  onPageChange: setPage,
                }
              : undefined
          }
        />
      )}

      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除工作区「{confirmDelete?.name}
            」吗？删除将移除存储的数据，此操作不可撤销。
          </AlertDialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-error text-white hover:bg-error/90"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                handleConfirmDelete();
              }}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              删除
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
