import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { ArrowLeft, FileSearch, History } from 'lucide-react';
import { useAuthToken } from '@/features/execution';
import { PageHeader } from '@/shared/components/page-header/PageHeader';
import { EmptyState } from '@/shared/components/empty-state/EmptyState';
import { Pagination } from '@/shared/components';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { cn } from '@/shared/lib/utils';
import {
  useAuditLog,
  usePendingReviews,
  useNodeVersions,
  memoryAuditKeys,
} from './api';
import {
  AuditTimeline,
  OPERATION_TONES,
  REVIEW_STATUS_META,
} from './AuditTimeline';
import { VersionDiffView } from './VersionDiffView';
import { ReviewActions } from './ReviewActions';
import { PendingReviewsList } from './PendingReviewsList';
import type {
  AuditLogEntry,
  AuditLogFilters,
  AuditOperationType,
  PendingReview,
  VersionDiffSelection,
  MemoryVersionCreatedEvent,
  MemoryVersionRollbackEvent,
  MemoryReviewSubmittedEvent,
} from './types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(
  /\/$/,
  '',
);

const DEFAULT_WINDOW_ORIGIN = 'http://localhost';
const RECONNECT_DELAY_MS = 5_000;
const RECONNECT_DELAY_MAX_MS = 30_000;

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

function stripApiSuffix(pathname: string): string {
  const normalizedPath = pathname.replace(/\/$/, '');
  if (!normalizedPath || normalizedPath === '/') return '';
  if (normalizedPath.endsWith('/api/v1'))
    return normalizedPath.slice(0, -'/api/v1'.length);
  if (normalizedPath.endsWith('/api'))
    return normalizedPath.slice(0, -'/api'.length);
  return normalizedPath;
}

function resolveMemorySocketUrl(
  apiBaseUrl: string,
  origin = typeof window === 'undefined'
    ? DEFAULT_WINDOW_ORIGIN
    : window.location.origin,
): string {
  const resolvedApiUrl = new URL(apiBaseUrl || '/api/v1', origin);
  const basePath = stripApiSuffix(resolvedApiUrl.pathname);
  const namespacePath = `${basePath}/memory`.replace(/\/+/g, '/');
  return new URL(namespacePath, resolvedApiUrl.origin).toString();
}

type TabKey = 'timeline' | 'pending';

const OPERATION_OPTIONS: { value: AuditOperationType | ''; label: string }[] = [
  { value: '', label: '全部操作' },
  { value: 'create', label: '创建' },
  { value: 'update', label: '更新' },
  { value: 'delete', label: '删除' },
  { value: 'rollback', label: '回滚' },
];

const OPERATION_LABELS: Record<AuditOperationType, string> = {
  create: '创建',
  update: '更新',
  delete: '删除',
  rollback: '回滚',
};

const CONNECTION_META: Record<
  ConnectionStatus,
  { label: string; tone: string; pulse: boolean }
> = {
  connected: {
    label: '实时同步',
    tone: 'var(--color-success)',
    pulse: false,
  },
  connecting: { label: '连接中...', tone: 'var(--color-warning)', pulse: true },
  disconnected: { label: '未连接', tone: 'var(--color-muted)', pulse: false },
};

interface MemoryAuditServerToClientEvents {
  'memory.version.created': (event: MemoryVersionCreatedEvent) => void;
  'memory.version.rollback': (event: MemoryVersionRollbackEvent) => void;
  'memory.review.submitted': (event: MemoryReviewSubmittedEvent) => void;
}

interface MemoryAuditClientToServerEvents {
  'memory:subscribe': (data: { instanceId: string }) => void;
  'memory:unsubscribe': (data: { instanceId: string }) => void;
}

type TypedSocket = Socket<
  MemoryAuditServerToClientEvents,
  MemoryAuditClientToServerEvents
>;

export function MemoryAuditPage() {
  const { id: instanceId } = useParams({
    from: '/memory/$id/audit' as const,
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const authToken = useAuthToken();

  // --- Tab State ---
  const [activeTab, setActiveTab] = useState<TabKey>('timeline');

  // --- Filter State ---
  const [filters, setFilters] = useState<AuditLogFilters>({
    page: 1,
    pageSize: 20,
  });
  const [searchInput, setSearchInput] = useState('');

  // --- Selection State ---
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(
    null,
  );
  const [diffSelection, setDiffSelection] =
    useState<VersionDiffSelection | null>(null);

  // --- Socket.IO State ---
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected');

  // --- Queries ---
  const auditLogQuery = useAuditLog(instanceId, filters);
  const pendingReviewsQuery = usePendingReviews(instanceId);
  const nodeVersionsQuery = useNodeVersions(
    instanceId,
    selectedEntry?.nodeId ?? '',
  );

  // --- Socket.IO Connection ---
  const socketUrl = useMemo(() => resolveMemorySocketUrl(API_BASE_URL), []);
  const callbacksRef = useRef({ queryClient, instanceId });
  callbacksRef.current = { queryClient, instanceId };

  useEffect(() => {
    if (!authToken || !instanceId) {
      setConnectionStatus('disconnected');
      return;
    }

    setConnectionStatus('connecting');

    const socket: TypedSocket = io(socketUrl, {
      auth: { token: authToken },
      reconnection: true,
      reconnectionDelay: RECONNECT_DELAY_MS,
      reconnectionDelayMax: RECONNECT_DELAY_MAX_MS,
      reconnectionAttempts: Infinity,
    });

    const handleConnect = () => {
      setConnectionStatus('connected');
      socket.emit('memory:subscribe', { instanceId });
    };

    const handleDisconnect = () => {
      setConnectionStatus('disconnected');
    };

    const handleConnectError = () => {
      setConnectionStatus('disconnected');
    };

    const handleVersionCreated = () => {
      const { queryClient: qc, instanceId: iid } = callbacksRef.current;
      qc.invalidateQueries({ queryKey: memoryAuditKeys.auditLog(iid) });
      qc.invalidateQueries({ queryKey: memoryAuditKeys.pendingReviews(iid) });
    };

    const handleVersionRollback = () => {
      const { queryClient: qc, instanceId: iid } = callbacksRef.current;
      qc.invalidateQueries({ queryKey: memoryAuditKeys.auditLog(iid) });
      qc.invalidateQueries({ queryKey: memoryAuditKeys.pendingReviews(iid) });
    };

    const handleReviewSubmitted = () => {
      const { queryClient: qc, instanceId: iid } = callbacksRef.current;
      qc.invalidateQueries({ queryKey: memoryAuditKeys.auditLog(iid) });
      qc.invalidateQueries({ queryKey: memoryAuditKeys.pendingReviews(iid) });
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('memory.version.created', handleVersionCreated);
    socket.on('memory.version.rollback', handleVersionRollback);
    socket.on('memory.review.submitted', handleReviewSubmitted);

    return () => {
      socket.emit('memory:unsubscribe', { instanceId });
      socket.removeAllListeners();
      socket.disconnect();
      setConnectionStatus('disconnected');
    };
  }, [authToken, instanceId, socketUrl]);

  // --- Handlers ---
  const handleBack = useCallback(() => {
    navigate({ to: '/memory/$id' as const, params: { id: instanceId } });
  }, [navigate, instanceId]);

  const handleEntrySelect = useCallback((entry: AuditLogEntry) => {
    setSelectedEntry(entry);
    setDiffSelection(null);
  }, []);

  const handlePendingSelect = useCallback(
    (review: PendingReview) => {
      setActiveTab('timeline');
      setFilters((prev) => ({
        ...prev,
        nodeName: undefined,
        operationType: undefined,
        page: 1,
      }));
      // 尝试在当前时间线中找到匹配的审计条目
      const match = auditLogQuery.data?.data.find(
        (e) => e.nodeId === review.nodeId && e.versionId === review.versionId,
      );
      if (match) {
        setSelectedEntry(match);
      }
    },
    [auditLogQuery.data],
  );

  const handleVersionSelect = useCallback(
    (versionId: string) => {
      if (!selectedEntry) return;
      const versions = nodeVersionsQuery.data;
      if (!versions) return;

      const selectedVersion = versions.find((v) => v.id === versionId);
      if (!selectedVersion) return;

      const currentIdx = versions.findIndex((v) => v.id === versionId);
      const previousVersion =
        currentIdx < versions.length - 1 ? versions[currentIdx + 1] : null;

      setDiffSelection({
        oldVersion: previousVersion ?? selectedVersion,
        newVersion: selectedVersion,
      });
    },
    [selectedEntry, nodeVersionsQuery.data],
  );

  const handleFilterChange = useCallback(
    (updates: Partial<AuditLogFilters>) => {
      setFilters((prev) => ({ ...prev, ...updates, page: 1 }));
    },
    [],
  );

  const handleSearch = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      nodeName: searchInput || undefined,
      page: 1,
    }));
  }, [searchInput]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
        handleSearch();
      }
    },
    [handleSearch],
  );

  const handlePageChange = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const pendingCount = pendingReviewsQuery.data?.length ?? 0;
  const connection = CONNECTION_META[connectionStatus];

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden p-6">
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
          icon={History}
          tone="var(--color-node-memory)"
          title="审计日志"
          description="追踪记忆节点的每一次变更、审核与回滚"
          actions={
            <Badge tone={connection.tone}>
              <span
                aria-hidden
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  connection.pulse && 'animate-pulse',
                )}
                style={{ backgroundColor: connection.tone }}
              />
              {connection.label}
            </Badge>
          }
        />
      </div>

      <Tabs
        value={activeTab}
        defaultValue="timeline"
        onValueChange={(next) => setActiveTab(next as TabKey)}
        className="flex min-h-0 flex-1 flex-col space-y-4"
      >
        <TabsList className="w-auto self-start">
          <TabsTrigger value="timeline" className="px-4">
            变更时间线
          </TabsTrigger>
          <TabsTrigger value="pending" className="px-4">
            待审核
            {pendingCount > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-warning/15 px-1 text-[10px] font-medium text-warning">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="timeline"
          className="flex min-h-0 flex-1 flex-col gap-4 space-y-0 lg:flex-row"
        >
          {/* 左：筛选 + 时间线 */}
          <div className="flex min-h-0 w-full flex-col overflow-hidden rounded-card border border-border bg-surface lg:w-96 lg:shrink-0">
            <div className="space-y-3 border-b border-border p-3">
              <div className="flex gap-2">
                <Input
                  placeholder="搜索节点名称..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  className="h-8 flex-1"
                />
                <Button variant="outline" size="sm" onClick={handleSearch}>
                  搜索
                </Button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {OPERATION_OPTIONS.map((opt) => {
                  const isActive = (filters.operationType ?? '') === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                        isActive
                          ? 'border-primary/30 bg-primary/10 text-primary'
                          : 'border-border text-muted hover:border-border-hover hover:text-foreground',
                      )}
                      onClick={() =>
                        handleFilterChange({
                          operationType: opt.value
                            ? (opt.value as AuditOperationType)
                            : undefined,
                        })
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  aria-label="起始日期"
                  className="h-8 flex-1 text-xs"
                  value={filters.startDate ?? ''}
                  onChange={(e) =>
                    handleFilterChange({
                      startDate: e.target.value || undefined,
                    })
                  }
                />
                <span className="text-xs text-muted">至</span>
                <Input
                  type="date"
                  aria-label="结束日期"
                  className="h-8 flex-1 text-xs"
                  value={filters.endDate ?? ''}
                  onChange={(e) =>
                    handleFilterChange({
                      endDate: e.target.value || undefined,
                    })
                  }
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <AuditTimeline
                entries={auditLogQuery.data?.data ?? []}
                isLoading={auditLogQuery.isLoading}
                selectedEntryId={selectedEntry?.id}
                onSelectEntry={handleEntrySelect}
              />
            </div>

            {auditLogQuery.data?.meta &&
              auditLogQuery.data.meta.totalPages > 1 && (
                <div className="border-t border-border p-3">
                  <Pagination
                    page={auditLogQuery.data.meta.page}
                    totalPages={auditLogQuery.data.meta.totalPages}
                    onPageChange={handlePageChange}
                    isLoading={auditLogQuery.isLoading}
                  />
                </div>
              )}
          </div>

          {/* 右：详情 */}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-card border border-border bg-surface">
            {selectedEntry ? (
              <div className="flex flex-col gap-6 p-5">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">
                      {selectedEntry.nodeName}
                    </h2>
                    <Badge
                      size="sm"
                      tone={OPERATION_TONES[selectedEntry.operationType]}
                    >
                      {OPERATION_LABELS[selectedEntry.operationType]}
                    </Badge>
                    <Badge
                      size="sm"
                      tone={REVIEW_STATUS_META[selectedEntry.reviewStatus].tone}
                    >
                      {REVIEW_STATUS_META[selectedEntry.reviewStatus].label}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted">
                    {selectedEntry.actor} 于{' '}
                    {new Intl.DateTimeFormat('zh-CN', {
                      dateStyle: 'medium',
                      timeStyle: 'medium',
                    }).format(new Date(selectedEntry.timestamp))}{' '}
                    执行了
                    {OPERATION_LABELS[selectedEntry.operationType]}操作
                  </p>
                </div>

                {nodeVersionsQuery.data &&
                  nodeVersionsQuery.data.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-foreground">
                        版本历史
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {nodeVersionsQuery.data.map((ver) => {
                          const isActive =
                            diffSelection?.newVersion.id === ver.id;
                          return (
                            <button
                              key={ver.id}
                              type="button"
                              aria-current={isActive ? 'true' : undefined}
                              className={cn(
                                'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                                isActive
                                  ? 'border-primary/40 bg-primary/10 text-primary'
                                  : 'border-border text-muted hover:border-border-hover hover:text-foreground',
                              )}
                              onClick={() => handleVersionSelect(ver.id)}
                            >
                              v{ver.versionNumber}
                              <span
                                aria-hidden
                                className="h-1.5 w-1.5 rounded-full"
                                style={{
                                  backgroundColor:
                                    REVIEW_STATUS_META[ver.reviewStatus].tone,
                                }}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                <VersionDiffView
                  oldVersion={diffSelection?.oldVersion ?? null}
                  newVersion={diffSelection?.newVersion ?? null}
                />

                <ReviewActions instanceId={instanceId} entry={selectedEntry} />
              </div>
            ) : (
              <div className="grid h-full place-items-center p-5">
                <EmptyState
                  icon={FileSearch}
                  tone="var(--color-info)"
                  title="选择一条审计记录查看详情"
                  description="左侧时间线中的任意条目都可展开版本对比与审核操作。"
                  className="border-none"
                />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent
          value="pending"
          className="min-h-0 flex-1 space-y-0 overflow-y-auto"
        >
          <PendingReviewsList
            reviews={pendingReviewsQuery.data ?? []}
            isLoading={pendingReviewsQuery.isLoading}
            onSelectReview={handlePendingSelect}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
