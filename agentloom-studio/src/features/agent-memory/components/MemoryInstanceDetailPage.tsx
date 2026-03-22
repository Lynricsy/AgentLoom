import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  Brain,
  Calendar,
  GitFork,
  Loader2,
  Network,
  Settings,
  Trash2,
} from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import {
  useDeleteMemoryInstance,
  useMemoryInstance,
} from '../hooks/useMemoryInstances';
import { getMemoryStatusLabel, getMemoryStatusVariant } from '../types';

interface MemoryInstanceDetailPageProps {
  memoryInstanceId: string;
}

export function MemoryInstanceDetailPage({
  memoryInstanceId,
}: MemoryInstanceDetailPageProps) {
  const navigate = useNavigate();
  const { data: instance, isLoading, isError } = useMemoryInstance(memoryInstanceId);
  const deleteMutation = useDeleteMemoryInstance();

  const handleBack = useCallback(() => {
    void navigate({ to: '/memory' });
  }, [navigate]);

  const handleSettings = useCallback(() => {
    void navigate({
      to: '/memory/$id/settings',
      params: { id: memoryInstanceId },
    });
  }, [navigate, memoryInstanceId]);

  const handleDelete = useCallback(async () => {
    if (!confirm('确定要删除此记忆实例吗？此操作不可恢复。')) return;
    try {
      await deleteMutation.mutateAsync(memoryInstanceId);
      void navigate({ to: '/memory' });
    } catch {
      // 错误已由 mutation 状态管理
    }
  }, [deleteMutation, memoryInstanceId, navigate]);

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
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !instance) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">加载记忆实例失败</p>
        <Button variant="outline" onClick={handleBack}>
          返回列表
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-6 gap-6">
      {/* 顶部导航 */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回
        </Button>
      </div>

      {/* 标题区域 */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Brain className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{instance.name}</h1>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                  {
                    'bg-emerald-500/20 text-emerald-400':
                      getMemoryStatusVariant(instance.status) === 'default',
                    'bg-muted text-muted-foreground':
                      getMemoryStatusVariant(instance.status) === 'secondary',
                    'bg-destructive/20 text-destructive':
                      getMemoryStatusVariant(instance.status) === 'destructive',
                  },
                )}
              >
                {getMemoryStatusLabel(instance.status)}
              </span>
            </div>
            {instance.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {instance.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSettings}>
            <Settings className="mr-1 h-4 w-4" />
            设置
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleDelete()}
            disabled={deleteMutation.isPending}
            className="text-destructive hover:bg-destructive/10"
          >
            {deleteMutation.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-1 h-4 w-4" />
            )}
            删除
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Network className="h-5 w-5 text-blue-400" />}
          label="节点数"
          value={instance.stats.nodeCount}
        />
        <StatCard
          icon={<GitFork className="h-5 w-5 text-purple-400" />}
          label="边数"
          value={instance.stats.edgeCount}
        />
        <StatCard
          icon={<Brain className="h-5 w-5 text-emerald-400" />}
          label="有效域"
          value={instance.validDomains?.length ?? 0}
        />
        <StatCard
          icon={<Calendar className="h-5 w-5 text-orange-400" />}
          label="创建时间"
          value={formatDate(instance.createdAt)}
          isText
        />
      </div>

      {/* 详细信息区域 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 有效域 */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            有效域
          </h3>
          {instance.validDomains && instance.validDomains.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {instance.validDomains.map((domain) => (
                <span
                  key={domain}
                  className="rounded-md bg-muted px-2.5 py-1 text-sm"
                >
                  {domain}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">未配置有效域</p>
          )}
        </div>

        {/* 核心记忆 URI */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            核心记忆 URI
          </h3>
          {instance.coreMemoryUris && instance.coreMemoryUris.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {instance.coreMemoryUris.map((uri) => (
                <span
                  key={uri}
                  className="rounded-md bg-muted px-2.5 py-1 text-sm font-mono"
                >
                  {uri}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              未配置核心记忆 URI
            </p>
          )}
        </div>
      </div>

      {/* 系统提示词概览 */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            系统提示词
          </h3>
          <Button variant="ghost" size="sm" onClick={handleSettings}>
            编辑
          </Button>
        </div>
        {instance.systemPromptOverride ? (
          <pre className="max-h-40 overflow-auto rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap">
            {instance.systemPromptOverride}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">
            使用默认模板
          </p>
        )}
      </div>
    </div>
  );
}

/** 统计卡片组件 */
function StatCard({
  icon,
  label,
  value,
  isText,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  isText?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className={cn('font-semibold', isText ? 'text-sm' : 'text-2xl')}>
        {value}
      </p>
    </div>
  );
}
