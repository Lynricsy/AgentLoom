import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  Brain,
  Calendar,
  GitFork,
  Network,
  Plus,
  Search,
  SearchX,
  Trash2,
} from "lucide-react";
import { Pagination, ResourceSourceCategoryTabs } from "@/shared/components";
import { PageHeader } from "@/shared/components/page-header/PageHeader";
import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import { convertResourceSourceToManual } from "@/shared/api/resourceSourceApi";
import {
  getResourceSourceLabel,
  type ResourceSourceKind,
} from "@/shared/lib/resourceSource";
import { staggerList } from "@/shared/lib/motion";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Badge } from "@/shared/ui/badge";
import { Card } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";
import { useToast } from "@/shared/ui/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import {
  useAllMemoryInstances,
  useDeleteMemoryInstance,
  useMemoryInstances,
} from "../hooks/useMemoryInstances";
import { getMemoryStatusLabel, getMemoryStatusVariant } from "../types";
import type { MemoryInstance } from "../types";
import { CreateMemoryDialog } from "./CreateMemoryDialog";

const PAGE_SIZE = 12;

/** 记忆域主色 — 与画布 memory 类别节点同源 */
const MEMORY_TONE = "var(--color-node-memory)";

const GRID_CLASS = "grid gap-4 sm:grid-cols-2 xl:grid-cols-3";

export function MemoryInstancesPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sourceKindFilter, setSourceKindFilter] =
    useState<ResourceSourceKind>("manual");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MemoryInstance | null>(null);

  const deleteMutation = useDeleteMemoryInstance();

  // 搜索模式使用 allMemoryInstances 本地过滤，否则分页查询
  const isSearching = searchQuery.trim().length > 0;
  const paginatedQuery = useMemoryInstances(
    isSearching
      ? undefined
      : { page, pageSize: PAGE_SIZE, sourceKind: sourceKindFilter },
  );
  const allQuery = useAllMemoryInstances({
    enabled: isSearching,
    sourceKind: sourceKindFilter,
  });

  const filteredItems = useMemo(() => {
    if (!isSearching) return [];
    const items = allQuery.data ?? [];
    const query = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query),
    );
  }, [isSearching, allQuery.data, searchQuery]);

  const displayItems = isSearching
    ? filteredItems
    : (paginatedQuery.data?.data ?? []);
  const totalPages = isSearching
    ? 1
    : (paginatedQuery.data?.meta.totalPages ?? 1);
  const isLoading = isSearching ? allQuery.isLoading : paginatedQuery.isLoading;

  const handleCardClick = useCallback(
    (id: string) => {
      void navigate({ to: "/memory/$id", params: { id } });
    },
    [navigate],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      notify({
        variant: "error",
        title: "删除失败",
        description: `「${deleteTarget.name}」未能删除，请稍后重试。`,
      });
    }
  }, [deleteMutation, deleteTarget, notify]);

  const handleCreateSuccess = useCallback(
    (id: string) => {
      void navigate({ to: "/memory/$id", params: { id } });
    },
    [navigate],
  );

  const handleConvertSource = useCallback(
    async (instance: MemoryInstance) => {
      try {
        await convertResourceSourceToManual("memory_instance", instance.id);
        await paginatedQuery.refetch();
        if (isSearching) {
          await allQuery.refetch();
        }
      } catch {
        notify({
          variant: "error",
          title: "转换失败",
          description: `「${instance.name}」未能转为自己创建，请稍后重试。`,
        });
      }
    },
    [allQuery, isSearching, notify, paginatedQuery],
  );

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  return (
    <div className="flex h-full flex-col gap-5 p-6">
      <PageHeader
        title="记忆管理"
        description="管理 Agent 记忆图谱实例，配置知识域和系统提示词"
        icon={Brain}
        tone={MEMORY_TONE}
        actions={
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" />
            新建实例
          </Button>
        }
      />

      <ResourceSourceCategoryTabs
        value={sourceKindFilter}
        onChange={(nextValue) => {
          setSourceKindFilter(nextValue);
          setPage(1);
        }}
      />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          className="pl-9"
          placeholder="搜索记忆实例..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {isLoading ? (
        <div className={GRID_CLASS}>
          {Array.from({ length: 6 }, (_, i) => (
            <Card
              key={i}
              data-testid="memory-instance-skeleton"
              className="flex flex-col gap-3 p-4"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-card" />
                <Skeleton className="h-4 w-32 rounded" />
              </div>
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-3 w-2/3 rounded" />
            </Card>
          ))}
        </div>
      ) : displayItems.length === 0 ? (
        <EmptyState
          icon={isSearching ? SearchX : Brain}
          tone={MEMORY_TONE}
          title={
            isSearching
              ? "没有找到匹配的记忆实例"
              : `还没有${getResourceSourceLabel(sourceKindFilter)}的记忆实例`
          }
          description={
            isSearching
              ? "换个关键词试试，或切换上方的来源分类。"
              : sourceKindFilter === "manual"
                ? "点击「新建实例」创建你的第一个 Agent 记忆图谱"
                : "从分享链接导入记忆实例后会出现在这里。"
          }
        />
      ) : (
        <>
          <div className={GRID_CLASS}>
            {displayItems.map((instance, i) => (
              <motion.div key={instance.id} {...staggerList(i)}>
                <Card
                  interactive
                  className="group flex h-full flex-col overflow-hidden"
                >
                  <button
                    type="button"
                    className="flex-1 rounded-card px-4 pb-3 pt-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    onClick={() => handleCardClick(instance.id)}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-card"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${MEMORY_TONE} 14%, transparent)`,
                          color: MEMORY_TONE,
                        }}
                      >
                        <Brain className="h-[18px] w-[18px]" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-foreground">
                            {instance.name}
                          </h3>
                          <Badge
                            size="sm"
                            variant={getMemoryStatusVariant(instance.status)}
                          >
                            {getMemoryStatusLabel(instance.status)}
                          </Badge>
                        </div>
                        {instance.description && (
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                            {instance.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2">
                    <div className="flex min-w-0 items-center gap-3 text-[11px] text-muted">
                      <span className="flex items-center gap-1">
                        <Network className="h-3 w-3" />
                        {instance.nodeCount ?? 0} 节点
                      </span>
                      <span className="flex items-center gap-1">
                        <GitFork className="h-3 w-3" />
                        {instance.validDomains?.length ?? 0} 域
                      </span>
                      <span className="hidden items-center gap-1 sm:flex">
                        <Calendar className="h-3 w-3" />
                        {formatDate(instance.createdAt)}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {instance.sourceKind === "share_imported" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] text-muted hover:text-foreground"
                          onClick={() => void handleConvertSource(instance)}
                        >
                          转为自己创建
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7 text-muted opacity-70 transition-opacity hover:bg-error/10 hover:text-error group-hover:opacity-100"
                        onClick={() => setDeleteTarget(instance)}
                        aria-label={`删除 ${instance.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>

          {!isSearching && totalPages > 1 && (
            <div className="flex justify-center pt-2">
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>删除记忆实例</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除「{deleteTarget?.name}」吗？此操作不可恢复。
          </AlertDialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-error text-white hover:bg-error/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              删除
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <CreateMemoryDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}
