import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Search, Database, Trash2 } from "lucide-react";
import { Pagination, ResourceSourceCategoryTabs } from "@/shared/components";
import { convertResourceSourceToManual } from "@/shared/api/resourceSourceApi";
import {
  getResourceSourceLabel,
  type ResourceSourceKind,
} from "@/shared/lib/resourceSource";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
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

function getKnowledgeBaseStatusClass(status: KnowledgeBaseStatus): string {
  switch (status) {
    case "ready":
      return "bg-emerald-500/10 text-emerald-700";
    case "processing":
      return "bg-blue-500/10 text-blue-700";
    case "failed":
      return "bg-rose-500/10 text-rose-700";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/**
 * 知识库列表页面
 * 路由: /resources/knowledge-bases
 * 功能: 展示知识库卡片列表、搜索过滤、创建知识库
 */
export function KnowledgeBasesPage() {
  const pageSize = 20;
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sourceKindFilter, setSourceKindFilter] =
    useState<ResourceSourceKind>("manual");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newKbName, setNewKbName] = useState("");
  const [newKbDescription, setNewKbDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeBase | null>(null);
  const deleteRestoreFocusRef = useRef<HTMLElement | null>(null);

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

  const restoreDeleteFocus = useCallback(() => {
    const element = deleteRestoreFocusRef.current;
    deleteRestoreFocusRef.current = null;

    if (element?.isConnected) {
      element.focus();
    }
  }, []);

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

  const handleDelete = useCallback((e: React.MouseEvent, kb: KnowledgeBase) => {
    e.stopPropagation();
    deleteRestoreFocusRef.current = e.currentTarget as HTMLElement;
    setDeleteTarget(kb);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSettled: () => {
        setDeleteTarget(null);
        restoreDeleteFocus();
      },
    });
  }, [deleteTarget, deleteMutation, restoreDeleteFocus]);

  const handleCancelDelete = useCallback(() => {
    setDeleteTarget(null);
    restoreDeleteFocus();
  }, [restoreDeleteFocus]);

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

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">加载知识库失败: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">知识库管理</h1>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          创建知识库
        </Button>
      </div>

      <ResourceSourceCategoryTabs
        value={sourceKindFilter}
        onChange={(nextValue) => {
          setSourceKindFilter(nextValue);
          setPage(1);
        }}
      />

      {/* 搜索 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
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

      {/* 加载状态 */}
      {isLoading && (
        <div className="flex items-center justify-center flex-1">
          <p className="text-muted-foreground">加载中...</p>
        </div>
      )}

      {/* 空状态 */}
      {!isLoading && visibleKnowledgeBases.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 gap-2">
          <Database className="w-12 h-12 text-muted-foreground" />
          <p className="text-muted-foreground">
            {searchQuery
              ? "没有匹配的知识库"
              : `还没有${getResourceSourceLabel(sourceKindFilter)}的知识库，点击上方按钮创建`}
          </p>
        </div>
      )}

      {/* 卡片网格 */}
      {!isLoading && visibleKnowledgeBases.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visibleKnowledgeBases.map((kb) => (
              <div
                key={kb.id}
                className="relative rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50"
              >
                <button
                  type="button"
                  onClick={() => handleCardClick(kb)}
                  className="w-full cursor-pointer text-left"
                >
                  <div className="pr-8">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-medium">{kb.name}</h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getKnowledgeBaseStatusClass(
                          kb.status,
                        )}`}
                      >
                        {getKnowledgeBaseStatusLabel(kb.status)}
                      </span>
                    </div>
                    {kb.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {kb.description}
                      </p>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{kb.documentCount} 个文档</span>
                    <span>·</span>
                    <span>{getKnowledgeNodeCountLabel(kb)}</span>
                    <span>·</span>
                    <span>
                      {kb.visibility === "organization" ? "组织" : "私有"}
                    </span>
                    <span>·</span>
                    <span>{getChunkingStrategyLabel(kb.chunkingStrategy)}</span>
                    <span>·</span>
                    <span>
                      更新于 {new Date(kb.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => handleDelete(e, kb)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-destructive"
                  aria-label={`删除 ${kb.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                {kb.sourceKind === "share_imported" ? (
                  <button
                    type="button"
                    onClick={() => void handleConvertSource(kb)}
                    className="absolute right-12 top-3 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    转为自己创建
                  </button>
                ) : null}

                {deleteTarget?.id === kb.id && (
                  <div
                    className="absolute right-3 top-12 z-10 w-72 rounded-xl border border-border bg-surface-elevated p-4 shadow-2xl"
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-foreground">
                        删除知识库
                      </p>
                      <p className="text-xs text-muted-foreground">
                        确认删除知识库「{deleteTarget.name}
                        」吗？该操作会同时删除其下文档、知识节点与向量索引，且不可恢复。
                      </p>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCancelDelete}
                      >
                        取消
                      </Button>
                      <Button
                        size="sm"
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={handleConfirmDelete}
                        disabled={deleteMutation.isPending}
                      >
                        {deleteMutation.isPending ? "删除中..." : "确认删除"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
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

      {!isLoading &&
        visibleKnowledgeBases.length === 0 &&
        paginationMeta &&
        paginationMeta.totalPages > 1 && (
          <Pagination
            page={paginationMeta.page}
            totalPages={paginationMeta.totalPages}
            onPageChange={setPage}
            isLoading={isLoading}
          />
        )}

      {/* 创建知识库对话框 */}
      {showCreateDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-label="创建知识库"
        >
          <div className="bg-background rounded-lg border border-border p-6 w-full max-w-md shadow-lg">
            <h2 className="text-lg font-semibold mb-4">创建知识库</h2>
            <div className="flex flex-col gap-3">
              <div>
                <label htmlFor="kb-name" className="text-sm font-medium">
                  名称
                </label>
                <Input
                  id="kb-name"
                  placeholder="输入知识库名称"
                  value={newKbName}
                  onChange={(e) => setNewKbName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label htmlFor="kb-description" className="text-sm font-medium">
                  描述
                </label>
                <Input
                  id="kb-description"
                  placeholder="输入描述（可选）"
                  value={newKbDescription}
                  onChange={(e) => setNewKbDescription(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
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
                {createMutation.isPending ? "创建中..." : "创建"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
