import { useCallback, useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  AlertCircle,
  ArrowLeft,
  Brain,
  Calendar,
  GitFork,
  History,
  Network,
  Settings,
  Share2,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header/PageHeader';
import { EmptyState } from '@/shared/components/empty-state/EmptyState';
import { Spinner } from '@/shared/components/spinner/Spinner';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useToast } from '@/shared/ui/toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { cn } from '@/shared/lib/utils';
import {
  useDeleteMemoryInstance,
  useMemoryInstance,
} from '../hooks/useMemoryInstances';
import { getMemoryStatusLabel, getMemoryStatusVariant } from '../types';

interface MemoryInstanceDetailPageProps {
  memoryInstanceId: string;
}

const MEMORY_TONE = 'var(--color-node-memory)';

export function MemoryInstanceDetailPage({
  memoryInstanceId,
}: MemoryInstanceDetailPageProps) {
  const navigate = useNavigate();
  const { notify } = useToast();
  const {
    data: instance,
    isLoading,
    isError,
  } = useMemoryInstance(memoryInstanceId);
  const deleteMutation = useDeleteMemoryInstance();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleBack = useCallback(() => {
    void navigate({ to: '/memory' });
  }, [navigate]);

  const handleSettings = useCallback(() => {
    void navigate({
      to: '/memory/$id/settings',
      params: { id: memoryInstanceId },
    });
  }, [navigate, memoryInstanceId]);

  const handleGraph = useCallback(() => {
    void navigate({
      to: '/memory/$id/graph',
      params: { id: memoryInstanceId },
    });
  }, [navigate, memoryInstanceId]);

  const handleAudit = useCallback(() => {
    void navigate({
      to: '/memory/$id/audit',
      params: { id: memoryInstanceId },
    });
  }, [navigate, memoryInstanceId]);

  const handleDelete = useCallback(async () => {
    try {
      await deleteMutation.mutateAsync(memoryInstanceId);
      setConfirmDelete(false);
      void navigate({ to: '/memory' });
    } catch {
      notify({
        variant: 'error',
        title: '删除失败',
        description: '记忆实例未能删除，请稍后重试。',
      });
    }
  }, [deleteMutation, memoryInstanceId, navigate, notify]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div
        className="flex h-full flex-col gap-6 p-6"
        data-testid="memory-detail-skeleton"
      >
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-card" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-48 rounded" />
            <Skeleton className="h-3 w-64 rounded" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[86px] rounded-card" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-40 rounded-card" />
          <Skeleton className="h-40 rounded-card" />
        </div>
      </div>
    );
  }

  if (isError || !instance) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={AlertCircle}
          tone="var(--color-error)"
          title="加载记忆实例失败"
          description="实例可能已被删除，或网络暂时不可用。"
          action={
            <Button variant="outline" onClick={handleBack}>
              返回列表
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 self-start text-muted hover:text-foreground"
          onClick={handleBack}
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </Button>

        <PageHeader
          icon={Brain}
          tone={MEMORY_TONE}
          title={
            <span className="flex items-center gap-2">
              <span className="truncate">{instance.name}</span>
              <Badge variant={getMemoryStatusVariant(instance.status)} size="sm">
                {getMemoryStatusLabel(instance.status)}
              </Badge>
            </span>
          }
          description={instance.description ?? undefined}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={handleGraph}>
                <Share2 className="h-4 w-4" />
                图谱
              </Button>
              <Button variant="outline" size="sm" onClick={handleAudit}>
                <History className="h-4 w-4" />
                审计
              </Button>
              <Button variant="outline" size="sm" onClick={handleSettings}>
                <Settings className="h-4 w-4" />
                设置
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                disabled={deleteMutation.isPending}
                className="text-error hover:border-error/40 hover:bg-error/10 hover:text-error"
              >
                {deleteMutation.isPending ? (
                  <Spinner size="sm" className="text-current" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                删除
              </Button>
            </>
          }
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Network className="h-4 w-4" />}
          tone="var(--color-node-memory)"
          label="节点数"
          value={instance.stats.nodeCount}
        />
        <StatCard
          icon={<GitFork className="h-4 w-4" />}
          tone="var(--color-node-routing)"
          label="边数"
          value={instance.stats.edgeCount}
        />
        <StatCard
          icon={<Brain className="h-4 w-4" />}
          tone="var(--color-node-knowledge)"
          label="有效域"
          value={instance.validDomains?.length ?? 0}
        />
        <StatCard
          icon={<Calendar className="h-4 w-4" />}
          tone="var(--color-type-exec)"
          label="创建时间"
          value={formatDate(instance.createdAt)}
          isText
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>有效域</CardTitle>
          </CardHeader>
          <CardContent>
            {instance.validDomains && instance.validDomains.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {instance.validDomains.map((domain) => (
                  <Badge
                    key={domain}
                    variant="outline"
                    tone="var(--color-node-knowledge)"
                  >
                    {domain}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">未配置有效域</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>核心记忆 URI</CardTitle>
          </CardHeader>
          <CardContent>
            {instance.coreMemoryUris && instance.coreMemoryUris.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {instance.coreMemoryUris.map((uri) => (
                  <span
                    key={uri}
                    className="rounded-md border border-border bg-surface-elevated px-2 py-1 font-mono text-xs text-foreground"
                  >
                    {uri}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">未配置核心记忆 URI</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>系统提示词</CardTitle>
          <Button variant="ghost" size="sm" onClick={handleSettings}>
            编辑
          </Button>
        </CardHeader>
        <CardContent>
          {instance.systemPromptOverride ? (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface-elevated p-3 font-mono text-xs leading-relaxed text-foreground">
              {instance.systemPromptOverride}
            </pre>
          ) : (
            <p className="text-sm text-muted">使用默认模板</p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogTitle>删除记忆实例</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除「{instance.name}」吗？此操作不可恢复。
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
              确认删除
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
  isText,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  tone: string;
  isText?: boolean;
}) {
  return (
    <Card data-testid="memory-stat-card" className="p-4">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="grid h-7 w-7 place-items-center rounded-md"
          style={{
            backgroundColor: `color-mix(in srgb, ${tone} 14%, transparent)`,
            color: tone,
          }}
        >
          {icon}
        </span>
        <span className="text-xs text-muted">{label}</span>
      </div>
      <p
        className={cn(
          'mt-2 font-semibold text-foreground',
          isText ? 'text-sm' : 'text-2xl leading-none',
        )}
      >
        {value}
      </p>
    </Card>
  );
}
