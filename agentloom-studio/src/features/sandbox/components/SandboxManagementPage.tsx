import { useState, useCallback, useEffect, useMemo } from "react";
import { AlertCircle, Container, Loader2, Plus, Search } from "lucide-react";
import { motion } from "motion/react";
import { staggerList } from "@/shared/lib/motion";
import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import { PageHeader } from "@/shared/components/page-header/PageHeader";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Skeleton } from "@/shared/ui/skeleton";
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
import { Pagination } from "@/shared/components";
import { useToast } from "@/shared/ui/toast";
import { useSandboxes } from "../api/sandboxQueries";
import {
  useStopSandbox,
  useStartSandbox,
  useDeleteSandbox,
} from "../api/sandboxMutations";
import { SandboxCard } from "./SandboxCard";
import { CreateSandboxDialog } from "./CreateSandboxDialog";
import type {
  SandboxSession,
  SandboxListParams,
  SandboxStatus,
} from "../types";

const PAGE_SIZE = 20;

/** Radix Select 不接受空字符串 value，用哨兵值表示「不过滤」 */
const ANY = "__any__";

const STATUS_OPTIONS: { value: SandboxStatus | typeof ANY; label: string }[] = [
  { value: ANY, label: "全部状态" },
  { value: "creating", label: "创建中" },
  { value: "ready", label: "就绪" },
  { value: "busy", label: "运行中" },
  { value: "stopping", label: "停止中" },
  { value: "stopped", label: "已停止" },
  { value: "failed", label: "失败" },
];

const LIFECYCLE_OPTIONS: {
  value: typeof ANY | "session" | "persistent";
  label: string;
}[] = [
  { value: ANY, label: "全部类型" },
  { value: "session", label: "临时" },
  { value: "persistent", label: "持久" },
];

const BINDING_OPTIONS: {
  value: typeof ANY | "resource" | "conversation" | "execution";
  label: string;
}[] = [
  { value: "resource", label: "资源沙箱" },
  { value: ANY, label: "全部绑定" },
  { value: "conversation", label: "对话沙箱" },
  { value: "execution", label: "执行沙箱" },
];

export function SandboxManagementPage() {
  const { notify } = useToast();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SandboxStatus | "">("");
  const [lifecycleFilter, setLifecycleFilter] = useState<
    "" | "session" | "persistent"
  >("");
  const [bindingFilter, setBindingFilter] = useState<
    "" | "resource" | "conversation" | "execution"
  >("resource");

  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SandboxSession | null>(
    null,
  );

  const stopMutation = useStopSandbox();
  const startMutation = useStartSandbox();
  const deleteMutation = useDeleteSandbox();

  const params = useMemo<SandboxListParams>(() => {
    const p: SandboxListParams = { page, pageSize: PAGE_SIZE };
    if (search.trim()) p.search = search.trim();
    if (statusFilter) p.status = statusFilter;
    if (lifecycleFilter) p.lifecycleMode = lifecycleFilter;
    if (bindingFilter) p.bindingType = bindingFilter;
    return p;
  }, [page, search, statusFilter, lifecycleFilter, bindingFilter]);

  const { data, isLoading, isError, refetch } = useSandboxes(params);
  const sessions = data?.data ?? [];
  const meta = data?.meta;

  useEffect(() => {
    if (!isError) return;
    notify({
      title: "沙箱列表加载失败",
      description: "请检查网络后重试。",
      variant: "error",
    });
  }, [isError, notify]);

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleStop = useCallback(
    (session: SandboxSession) => {
      stopMutation.mutate(session.id, {
        onSuccess: () => {
          notify({
            title: "已停止",
            description: `沙箱「${session.config.name || session.id.slice(0, 8)}」已停止。`,
            variant: "success",
          });
        },
        onError: (err) => {
          notify({
            title: "停止失败",
            description: err instanceof Error ? err.message : "请稍后重试。",
            variant: "error",
          });
        },
      });
    },
    [stopMutation, notify],
  );

  const handleStart = useCallback(
    (session: SandboxSession) => {
      startMutation.mutate(session.id, {
        onSuccess: () => {
          notify({
            title: "已启动",
            description: `沙箱「${session.config.name || session.id.slice(0, 8)}」已启动。`,
            variant: "success",
          });
        },
        onError: (err) => {
          notify({
            title: "启动失败",
            description: err instanceof Error ? err.message : "请稍后重试。",
            variant: "error",
          });
        },
      });
    },
    [startMutation, notify],
  );

  const handleDelete = useCallback((session: SandboxSession) => {
    setConfirmDelete(session);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!confirmDelete) return;
    deleteMutation.mutate(confirmDelete.id, {
      onSuccess: () => {
        setConfirmDelete(null);
        notify({
          title: "已删除",
          description: `已删除沙箱「${confirmDelete.config.name || confirmDelete.id.slice(0, 8)}」。`,
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

  const hasFilters =
    search.trim() !== "" || statusFilter !== "" || lifecycleFilter !== "";

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
      <PageHeader
        icon={Container}
        tone="var(--color-type-sandbox)"
        title="沙箱"
        description="管理 Agent 的代码执行沙箱环境"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            创建沙箱
          </Button>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索沙箱..."
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-3 gap-2 lg:flex lg:shrink-0">
          <Select
            value={statusFilter || ANY}
            onValueChange={(value) => {
              setStatusFilter(value === ANY ? "" : (value as SandboxStatus));
              setPage(1);
            }}
          >
            <SelectTrigger className="lg:w-32" aria-label="状态筛选">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={lifecycleFilter || ANY}
            onValueChange={(value) => {
              setLifecycleFilter(
                value === ANY ? "" : (value as "session" | "persistent"),
              );
              setPage(1);
            }}
          >
            <SelectTrigger className="lg:w-32" aria-label="生命周期筛选">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIFECYCLE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={bindingFilter || ANY}
            onValueChange={(value) => {
              setBindingFilter(
                value === ANY
                  ? ""
                  : (value as "resource" | "conversation" | "execution"),
              );
              setPage(1);
            }}
          >
            <SelectTrigger className="lg:w-36" aria-label="绑定类型筛选">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BINDING_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted">
        默认只显示真正可复用的资源型沙箱；对话和执行过程里的会话沙箱可按需切换查看。
      </p>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-44 rounded-card" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          tone="var(--color-error)"
          title="沙箱列表加载失败"
          description="请稍后重试，或检查沙箱服务是否可用。"
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              重新加载
            </Button>
          }
        />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={Container}
          tone="var(--color-type-sandbox)"
          title={hasFilters ? "没有匹配的沙箱" : "暂无沙箱"}
          description={
            hasFilters
              ? "换个关键词，或放宽状态与类型筛选。"
              : "持久沙箱可跨会话复用，适合长期驻留的开发与调试环境。"
          }
          action={
            hasFilters ? null : (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                创建沙箱
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sessions.map((session, index) => (
              <motion.div key={session.id} {...staggerList(index)}>
                <SandboxCard
                  session={session}
                  onStop={handleStop}
                  onStart={handleStart}
                  onDelete={handleDelete}
                />
              </motion.div>
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

      <CreateSandboxDialog open={createOpen} onOpenChange={setCreateOpen} />

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除沙箱「
            {confirmDelete
              ? confirmDelete.config.name || confirmDelete.id.slice(0, 8)
              : ""}
            」吗？此操作不可撤销。
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
