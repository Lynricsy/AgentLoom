import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { useAuthToken } from '@/features/execution';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Pagination } from '@/shared/components';
import {
  useAuditLog,
  usePendingReviews,
  useNodeVersions,
  memoryAuditKeys,
} from './api';
import { AuditTimeline } from './AuditTimeline';
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

  // --- Connection Status Indicator ---
  const connectionIndicator = useMemo(() => {
    switch (connectionStatus) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            实时同步
          </span>
        );
      case 'connecting':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-amber-400">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            连接中...
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="h-2 w-2 rounded-full bg-zinc-500" />
            未连接
          </span>
        );
    }
  }, [connectionStatus]);

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            ← 返回
          </Button>
          <h1 className="text-lg font-semibold text-zinc-100">审计日志</h1>
          {connectionIndicator}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 px-6">
        <button
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'timeline'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
          onClick={() => setActiveTab('timeline')}
        >
          变更时间线
        </button>
        <button
          className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'pending'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
          onClick={() => setActiveTab('pending')}
        >
          待审核
          {(pendingReviewsQuery.data?.length ?? 0) > 0 && (
            <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/20 px-1 text-xs text-amber-400">
              {pendingReviewsQuery.data?.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {activeTab === 'timeline' && (
          <>
            {/* Left: Timeline + Filters */}
            <div className="flex w-96 flex-col border-r border-zinc-800">
              {/* Filters */}
              <div className="space-y-3 border-b border-zinc-800 p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="搜索节点名称..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className="flex-1"
                  />
                  <Button variant="outline" size="sm" onClick={handleSearch}>
                    搜索
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {OPERATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      className={`rounded-full px-3 py-1 text-xs transition-colors ${
                        (filters.operationType ?? '') === opt.value
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
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
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="date"
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
                    value={filters.startDate ?? ''}
                    onChange={(e) =>
                      handleFilterChange({
                        startDate: e.target.value || undefined,
                      })
                    }
                  />
                  <span className="self-center text-xs text-zinc-500">至</span>
                  <input
                    type="date"
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
                    value={filters.endDate ?? ''}
                    onChange={(e) =>
                      handleFilterChange({
                        endDate: e.target.value || undefined,
                      })
                    }
                  />
                </div>
              </div>

              {/* Timeline */}
              <div className="flex-1 overflow-y-auto">
                <AuditTimeline
                  entries={auditLogQuery.data?.data ?? []}
                  isLoading={auditLogQuery.isLoading}
                  selectedEntryId={selectedEntry?.id}
                  onSelectEntry={handleEntrySelect}
                />
              </div>

              {/* Pagination */}
              {auditLogQuery.data?.meta && auditLogQuery.data.meta.totalPages > 1 && (
                <div className="border-t border-zinc-800 p-3">
                  <Pagination
                    page={auditLogQuery.data.meta.page}
                    totalPages={auditLogQuery.data.meta.totalPages}
                    onPageChange={handlePageChange}
                    isLoading={auditLogQuery.isLoading}
                  />
                </div>
              )}
            </div>

            {/* Right: Detail Panel */}
            <div className="flex flex-1 flex-col overflow-y-auto">
              {selectedEntry ? (
                <div className="flex flex-col gap-6 p-6">
                  {/* Entry Info Header */}
                  <div className="space-y-2">
                    <h2 className="text-base font-medium text-zinc-100">
                      {selectedEntry.nodeName}
                    </h2>
                    <p className="text-sm text-zinc-400">
                      {selectedEntry.actor} 于{' '}
                      {new Intl.DateTimeFormat('zh-CN', {
                        dateStyle: 'medium',
                        timeStyle: 'medium',
                      }).format(new Date(selectedEntry.timestamp))}{' '}
                      执行了{' '}
                      <span className="font-medium text-zinc-200">
                        {selectedEntry.operationType === 'create'
                          ? '创建'
                          : selectedEntry.operationType === 'update'
                            ? '更新'
                            : selectedEntry.operationType === 'delete'
                              ? '删除'
                              : '回滚'}
                      </span>{' '}
                      操作
                    </p>
                  </div>

                  {/* Version Selector */}
                  {nodeVersionsQuery.data && nodeVersionsQuery.data.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-zinc-300">
                        版本历史
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {nodeVersionsQuery.data.map((ver) => (
                          <button
                            key={ver.id}
                            className={`rounded px-3 py-1.5 text-xs transition-colors ${
                              diffSelection?.newVersion.id === ver.id
                                ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50'
                                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                            }`}
                            onClick={() => handleVersionSelect(ver.id)}
                          >
                            v{ver.versionNumber}
                            {ver.reviewStatus === 'pending' && (
                              <span className="ml-1 text-amber-400">●</span>
                            )}
                            {ver.reviewStatus === 'approved' && (
                              <span className="ml-1 text-emerald-400">●</span>
                            )}
                            {ver.reviewStatus === 'rejected' && (
                              <span className="ml-1 text-red-400">●</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Version Diff */}
                  <VersionDiffView
                    oldVersion={diffSelection?.oldVersion ?? null}
                    newVersion={diffSelection?.newVersion ?? null}
                  />

                  <ReviewActions
                    instanceId={instanceId}
                    entry={selectedEntry}
                  />
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-sm text-zinc-500">
                    选择一条审计记录查看详情
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'pending' && (
          <div className="flex-1 overflow-y-auto p-6">
            <PendingReviewsList
              reviews={pendingReviewsQuery.data ?? []}
              isLoading={pendingReviewsQuery.isLoading}
              onSelectReview={handlePendingSelect}
            />
          </div>
        )}
      </div>
    </div>
  );
}
