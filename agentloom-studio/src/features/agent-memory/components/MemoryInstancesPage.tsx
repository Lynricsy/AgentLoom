import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Brain,
  Calendar,
  GitFork,
  Loader2,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Pagination } from '@/shared/components';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';
import {
  useAllMemoryInstances,
  useDeleteMemoryInstance,
  useMemoryInstances,
} from '../hooks/useMemoryInstances';
import { getMemoryStatusLabel, getMemoryStatusVariant } from '../types';
import type { MemoryInstance } from '../types';
import { CreateMemoryDialog } from './CreateMemoryDialog';

const PAGE_SIZE = 12;

export function MemoryInstancesPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MemoryInstance | null>(null);
  const deleteRestoreFocusRef = useRef<HTMLButtonElement | null>(null);

  const deleteMutation = useDeleteMemoryInstance();

  // 搜索模式使用 allMemoryInstances 本地过滤，否则分页查询
  const isSearching = searchQuery.trim().length > 0;
  const paginatedQuery = useMemoryInstances(
    isSearching ? undefined : { page, pageSize: PAGE_SIZE },
  );
  const allQuery = useAllMemoryInstances({ enabled: isSearching });

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
      void navigate({ to: '/memory/$id', params: { id } });
    },
    [navigate],
  );

  const handleDelete = useCallback(
    async (instance: MemoryInstance) => {
      try {
        await deleteMutation.mutateAsync(instance.id);
        setDeleteTarget(null);
      } catch {
        // 错误已由 mutation 状态管理
      }
    },
    [deleteMutation],
  );

  const handleCreateSuccess = useCallback(
    (id: string) => {
      void navigate({ to: '/memory/$id', params: { id } });
    },
    [navigate],
  );

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  return (
    <div className="flex h-full flex-col p-6 gap-4">
      {/* 页面头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">记忆管理</h1>
          <p className="text-sm text-muted-foreground">
            管理 Agent 记忆图谱实例，配置知识域和系统提示词
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          新建实例
        </Button>
      </div>

      {/* 搜索栏 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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

      {/* 内容区域 */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : displayItems.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Brain className="h-12 w-12" />
          <p className="text-lg font-medium">
            {isSearching ? '没有找到匹配的记忆实例' : '还没有记忆实例'}
          </p>
          {!isSearching && (
            <p className="text-sm">
              点击「新建实例」创建你的第一个 Agent 记忆图谱
            </p>
          )}
        </div>
      ) : (
        <>
          {/* 卡片网格 */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {displayItems.map((instance) => (
              <div
                key={instance.id}
                className="group relative rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50"
              >
                {/* 可点击区域 */}
                <button
                  className="w-full cursor-pointer text-left"
                  onClick={() => handleCardClick(instance.id)}
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Brain className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold line-clamp-1">
                        {instance.name}
                      </h3>
                    </div>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        {
                          'bg-emerald-500/20 text-emerald-400':
                            getMemoryStatusVariant(instance.status) ===
                            'default',
                          'bg-muted text-muted-foreground':
                            getMemoryStatusVariant(instance.status) ===
                            'secondary',
                          'bg-destructive/20 text-destructive':
                            getMemoryStatusVariant(instance.status) ===
                            'destructive',
                        },
                      )}
                    >
                      {getMemoryStatusLabel(instance.status)}
                    </span>
                  </div>

                  {instance.description && (
                    <p className="mb-3 text-sm text-muted-foreground line-clamp-2">
                      {instance.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <GitFork className="h-3 w-3" />
                      {instance.validDomains?.length ?? 0} 域
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(instance.createdAt)}
                    </span>
                  </div>
                </button>

                {/* 删除按钮 */}
                <button
                  ref={
                    deleteTarget?.id === instance.id
                      ? deleteRestoreFocusRef
                      : undefined
                  }
                  className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(instance);
                  }}
                  aria-label={`删除 ${instance.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>

                {/* 删除确认弹出框 */}
                {deleteTarget?.id === instance.id && (
                  <div className="absolute right-3 top-12 z-10 w-64 rounded-lg border border-border bg-popover p-4 shadow-lg">
                    <p className="mb-3 text-sm">
                      确定要删除「{instance.name}」吗？此操作不可恢复。
                    </p>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(null);
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        取消
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(instance);
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        {deleteMutation.isPending && (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        )}
                        删除
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 分页 */}
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

      {/* 创建对话框 */}
      <CreateMemoryDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}
