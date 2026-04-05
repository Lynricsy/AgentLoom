import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, Plus, FolderOpen, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Pagination } from "@/shared/components";
import { useToast } from "@/shared/ui/toast";
import { useWorkspaces } from "../api/workspaceQueries";
import { useDeleteWorkspace } from "../api/workspaceMutations";
import { WorkspaceCard } from "./WorkspaceCard";
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog";
import type { Workspace, WorkspaceListParams } from "../types";

const PAGE_SIZE = 20;

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

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">工作区</h1>
          <p className="text-sm text-muted-foreground">
            管理 Agent 的持久化工作区存储
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          创建工作区
        </Button>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索工作区..."
            className="pl-9"
          />
        </div>
        <select
          value={showExecutionArchives ? "all" : "primary"}
          onChange={(e) => {
            setShowExecutionArchives(e.target.value === "all");
            setPage(1);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <option value="primary">常规工作区</option>
          <option value="all">包含执行归档</option>
        </select>
      </div>

      <p className="text-xs text-muted-foreground">
        默认隐藏工作流执行自动归档出来的快照，避免资源页被历史执行结果淹没。
      </p>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm font-medium">工作区列表加载失败</p>
          <p className="text-sm text-muted-foreground">请稍后重试</p>
          <Button variant="outline" onClick={() => void refetch()}>
            重新加载
          </Button>
        </div>
      ) : workspaces.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20">
          <FolderOpen className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {hasFilters ? "没有匹配的工作区" : "暂无工作区，点击右上角创建"}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            {workspaces.map((workspace) => (
              <WorkspaceCard
                key={workspace.id}
                workspace={workspace}
                onDelete={handleDelete}
                onOpen={handleOpenWorkspace}
              />
            ))}
          </div>

          {meta && meta.totalPages > 1 && (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              onPageChange={setPage}
              isLoading={isLoading}
            />
          )}
        </>
      )}

      {/* Create dialog */}
      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setConfirmDelete(null)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setConfirmDelete(null);
            }}
            role="button"
            tabIndex={-1}
            aria-label="关闭对话框"
          />
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-2xl">
            <h3 className="text-base font-semibold">确认删除</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              确定要删除工作区「{confirmDelete.name}
              」吗？删除将移除存储的数据，此操作不可撤销。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(null)}
              >
                取消
              </Button>
              <Button
                size="sm"
                className="bg-red-600 text-white hover:bg-red-700"
                disabled={deleteMutation.isPending}
                onClick={handleConfirmDelete}
              >
                {deleteMutation.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
