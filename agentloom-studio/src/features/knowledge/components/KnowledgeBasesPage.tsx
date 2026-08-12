import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  AlertCircle,
  Database,
  FolderSync,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Pagination, ResourceSourceCategoryTabs } from "@/shared/components";
import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import { PageHeader } from "@/shared/components/page-header/PageHeader";
import { convertResourceSourceToManual } from "@/shared/api/resourceSourceApi";
import {
  getResourceSourceLabel,
  type ResourceSourceKind,
} from "@/shared/lib/resourceSource";
import { staggerList } from "@/shared/lib/motion";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { useToast } from "@/shared/ui/toast";
import {
  useKnowledgeBases,
  useAllKnowledgeBases,
  useCreateKnowledgeBase,
  useDeleteKnowledgeBase,
} from "../hooks/useKnowledgeBases";
import {
  getKnowledgeBaseStatusLabel,
  getKnowledgeNodeCountLabel,
  getChunkingStrategyLabel,
  type KnowledgeBase,
  type KnowledgeBaseStatus,
} from "../types";

const EMPTY_KNOWLEDGE_BASES: KnowledgeBase[] = [];

const KNOWLEDGE_TONE = "var(--color-type-knowledge)";

const STATUS_VARIANT: Record<
  KnowledgeBaseStatus,
  "success" | "info" | "error" | "secondary"
> = {
  ready: "success",
  processing: "info",
  failed: "error",
  empty: "secondary",
};

/**
 * 知识库列表页面
 * 路由: /resources/knowledge-bases
 * 功能: 展示知识库卡片列表、搜索过滤、创建知识库
 *
 * 选用卡片栅格而非 DataTable：单条知识库要同时呈现描述、文档数、知识节点数、
 * 可见性、分块策略与更新时间共 6 项异构信息，表格列会挤成一行难以扫读。
 */
export function KnowledgeBasesPage() {
  const pageSize = 20;
  const { notify } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sourceKindFilter, setSourceKindFilter] =
    useState<ResourceSourceKind>("manual");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newKbName, setNewKbName] = useState("");
  const [newKbDescription, setNewKbDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeBase | null>(null);

  const navigate = useNavigate();
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const isSearching = normalizedSearchQuery.length > 0;
  const {
    data,
    isLoading: isPageLoading,
    error: pageError,
    refetch: refetchPageKnowledgeBases,
  } = useKnowledgeBases({
    page,
    pageSize,
    sourceKind: sourceKindFilter,
  });
  const {
    data: allKnowledgeBases,
    isLoading: isAllKnowledgeBasesLoading,
    error: allKnowledgeBasesError,
    refetch: refetchAllKnowledgeBases,
  } = useAllKnowledgeBases({
    enabled: isSearching,
    sourceKind: sourceKindFilter,
  });
  const createMutation = useCreateKnowledgeBase();
  const deleteMutation = useDeleteKnowledgeBase();
  const knowledgeBases = data?.data ?? EMPTY_KNOWLEDGE_BASES;

  const filteredKnowledgeBases = useMemo(() => {
    const sourceKnowledgeBases = isSearching
      ? (allKnowledgeBases ?? [])
      : knowledgeBases;

    if (!isSearching) {
      return sourceKnowledgeBases;
    }

    return sourceKnowledgeBases.filter(
      (kb) =>
        kb.name.toLowerCase().includes(normalizedSearchQuery) ||
        (kb.description ?? "").toLowerCase().includes(normalizedSearchQuery),
    );
  }, [allKnowledgeBases, isSearching, knowledgeBases, normalizedSearchQuery]);

  const paginationMeta = useMemo(() => {
    if (!isSearching) {
      return data?.meta;
    }

    return {
      page,
      pageSize,
      total: filteredKnowledgeBases.length,
      totalPages: Math.max(
        1,
        Math.ceil(filteredKnowledgeBases.length / pageSize),
      ),
    };
  }, [data?.meta, filteredKnowledgeBases.length, isSearching, page]);

  const visibleKnowledgeBases = useMemo(() => {
    if (!isSearching) {
      return filteredKnowledgeBases;
    }

    const startIndex = (page - 1) * pageSize;
    return filteredKnowledgeBases.slice(startIndex, startIndex + pageSize);
  }, [filteredKnowledgeBases, isSearching, page]);

  const isLoading = isSearching ? isAllKnowledgeBasesLoading : isPageLoading;
  const error = isSearching ? (allKnowledgeBasesError ?? pageError) : pageError;

  useEffect(() => {
    if (paginationMeta && page > paginationMeta.totalPages) {
      setPage(paginationMeta.totalPages);
    }
  }, [page, paginationMeta]);

  useEffect(() => {
    if (!error) return;
    notify({
      title: "知识库列表加载失败",
      description: error.message,
      variant: "error",
    });
  }, [error, notify]);

  const handleRetry = useCallback(() => {
    void refetchPageKnowledgeBases();
    if (isSearching) {
      void refetchAllKnowledgeBases();
    }
  }, [isSearching, refetchAllKnowledgeBases, refetchPageKnowledgeBases]);

  const handleCreate = useCallback(() => {
    if (!newKbName.trim()) return;
    createMutation.mutate(
      {
        name: newKbName.trim(),
        description: newKbDescription.trim() || undefined,
      },
      {
        onSuccess: (createdKnowledgeBase) => {
          setShowCreateDialog(false);
          setNewKbName("");
          setNewKbDescription("");
          void navigate({
            to: "/resources/knowledge-bases/$knowledgeBaseId",
            params: { knowledgeBaseId: createdKnowledgeBase.id },
          });
        },
      },
    );
  }, [createMutation, navigate, newKbDescription, newKbName]);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSettled: () => {
        setDeleteTarget(null);
      },
    });
  }, [deleteTarget, deleteMutation]);

  const handleCardClick = useCallback(
    (kb: KnowledgeBase) => {
      void navigate({
        to: "/resources/knowledge-bases/$knowledgeBaseId",
        params: { knowledgeBaseId: kb.id },
      });
    },
    [navigate],
  );

  const handleConvertSource = useCallback(
    async (kb: KnowledgeBase) => {
      try {
        await convertResourceSourceToManual("knowledge_base", kb.id);
        await refetchPageKnowledgeBases();
        if (isSearching) {
          await refetchAllKnowledgeBases();
        }
      } catch {
        // noop
      }
    },
    [isSearching, refetchAllKnowledgeBases, refetchPageKnowledgeBases],
  );

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
      <PageHeader
        icon={Database}
        tone={KNOWLEDGE_TONE}
        title="知识库管理"
        description="管理 Agent 检索用的知识库，上传文档后自动完成解析、切分与索引"
        actions={
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            创建知识库
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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          placeholder="搜索知识库..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(1);
          }}
          className="pl-9"
        />
      </div>

      {error ? (
        <EmptyState
          icon={AlertCircle}
          tone="var(--color-error)"
          title="加载知识库失败"
          description={error.message}
          action={
            <Button variant="outline" onClick={handleRetry}>
              重新加载
            </Button>
          }
        />
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton
              key={index}
              data-testid="knowledge-base-card-skeleton"
              className="h-36 rounded-card"
            />
          ))}
        </div>
      ) : visibleKnowledgeBases.length === 0 ? (
        <EmptyState
          icon={Database}
          tone={KNOWLEDGE_TONE}
          title={
            isSearching
              ? "没有匹配的知识库"
              : sourceKindFilter === "manual"
                ? "还没有自己创建的知识库，点击上方按钮创建"
                : `还没有${getResourceSourceLabel(sourceKindFilter)}的知识库`
          }
          description={
            isSearching
              ? "换个关键词试试，搜索会覆盖全部分页。"
              : "知识库把文档切分成可检索的知识节点，供 Agent 在对话与工作流中调用。"
          }
          action={
            isSearching ? null : (
              <Button size="sm" onClick={() => setShowCreateDialog(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                创建第一个知识库
              </Button>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleKnowledgeBases.map((kb, index) => (
              <motion.div key={kb.id} {...staggerList(index)}>
                <Card className="h-full p-5">
                  <article className="flex h-full flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            aria-hidden
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-card"
                            style={{
                              backgroundColor: `color-mix(in srgb, ${KNOWLEDGE_TONE} 14%, transparent)`,
                              color: KNOWLEDGE_TONE,
                            }}
                          >
                            <Database className="h-4 w-4" />
                          </span>
                          <button
                            type="button"
                            className="cursor-pointer truncate text-sm font-semibold text-foreground transition-colors hover:text-primary"
                            onClick={() => handleCardClick(kb)}
                          >
                            {kb.name}
                          </button>
                          <Badge
                            size="sm"
                            variant={STATUS_VARIANT[kb.status]}
                            className="whitespace-nowrap"
                          >
                            {getKnowledgeBaseStatusLabel(kb.status)}
                          </Badge>
                        </div>
                        {kb.description && (
                          <p className="mt-2 line-clamp-2 text-xs text-muted">
                            {kb.description}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {kb.sourceKind === "share_imported" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="whitespace-nowrap"
                            onClick={() => void handleConvertSource(kb)}
                          >
                            <FolderSync className="h-3.5 w-3.5 sm:mr-1.5" />
                            <span className="hidden sm:inline">
                              转为自己创建
                            </span>
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted hover:text-error"
                          aria-label={`删除 ${kb.name}`}
                          onClick={() => setDeleteTarget(kb)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-xs text-muted">
                      <span>{kb.documentCount} 个文档</span>
                      <span aria-hidden>·</span>
                      <span>{getKnowledgeNodeCountLabel(kb)}</span>
                      <span aria-hidden>·</span>
                      <span>
                        {kb.visibility === "organization" ? "组织" : "私有"}
                      </span>
                      <span aria-hidden>·</span>
                      <span>{getChunkingStrategyLabel(kb.chunkingStrategy)}</span>
                      <span aria-hidden>·</span>
                      <span>
                        更新于 {new Date(kb.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </article>
                </Card>
              </motion.div>
            ))}
          </div>

          {paginationMeta && (
            <Pagination
              page={paginationMeta.page}
              totalPages={paginationMeta.totalPages}
              onPageChange={setPage}
              isLoading={isLoading}
            />
          )}
        </div>
      )}

      {/* 创建知识库对话框 */}
      <Dialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          if (!open) setShowCreateDialog(false);
        }}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>创建知识库</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <label htmlFor="kb-name">
                <Label>名称</Label>
              </label>
              <Input
                id="kb-name"
                placeholder="输入知识库名称"
                value={newKbName}
                onChange={(e) => setNewKbName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="kb-description">
                <Label>描述</Label>
              </label>
              <Input
                id="kb-description"
                placeholder="输入描述（可选）"
                value={newKbDescription}
                onChange={(e) => setNewKbDescription(e.target.value)}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
            >
              取消
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newKbName.trim() || createMutation.isPending}
            >
              {createMutation.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>删除知识库</AlertDialogTitle>
          <AlertDialogDescription>
            确认删除知识库「{deleteTarget?.name}
            」吗？该操作会同时删除其下文档、知识节点与向量索引，且不可恢复。
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
              确认删除
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
