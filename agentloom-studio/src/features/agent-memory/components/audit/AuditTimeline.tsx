/**
 * 审计时间线组件 — 展示记忆变更历史
 */
import { useMemo } from 'react';
import type { AuditLogEntry, AuditOperationType, ReviewStatus } from './types';

// --- 操作类型配置 ---

const OPERATION_LABELS: Record<AuditOperationType, string> = {
  create: '创建',
  update: '更新',
  delete: '删除',
  rollback: '回滚',
};

const OPERATION_COLORS: Record<AuditOperationType, string> = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800',
  rollback: 'bg-amber-100 text-amber-800',
};

const REVIEW_STATUS_BADGE: Record<
  ReviewStatus,
  { label: string; className: string }
> = {
  pending: { label: '待审核', className: 'bg-yellow-100 text-yellow-800' },
  approved: { label: '已批准', className: 'bg-green-100 text-green-800' },
  rejected: { label: '已拒绝', className: 'bg-red-100 text-red-800' },
};

function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso));
}

interface AuditTimelineProps {
  entries: AuditLogEntry[];
  isLoading: boolean;
  onSelectEntry?: (entry: AuditLogEntry) => void;
  selectedEntryId?: string;
}

export function AuditTimeline({
  entries,
  isLoading,
  onSelectEntry,
  selectedEntryId,
}: AuditTimelineProps) {
  const sortedEntries = useMemo(
    () =>
      [...entries].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      ),
    [entries],
  );

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="audit-timeline-loading">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="animate-pulse flex gap-4">
            <div className="h-8 w-8 rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-gray-200" />
              <div className="h-3 w-1/2 rounded bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (sortedEntries.length === 0) {
    return (
      <div
        className="py-12 text-center text-gray-500"
        data-testid="audit-timeline-empty"
      >
        暂无审计记录
      </div>
    );
  }

  return (
    <div className="relative" data-testid="audit-timeline">
      {/* 时间线竖线 */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

      <div className="space-y-6">
        {sortedEntries.map((entry) => {
          const opConfig = OPERATION_COLORS[entry.operationType];
          const reviewConfig = REVIEW_STATUS_BADGE[entry.reviewStatus];
          const isSelected = selectedEntryId === entry.id;

          return (
            <div
              key={entry.id}
              className={`relative flex gap-4 pl-10 cursor-pointer rounded-lg p-3 transition-colors ${
                isSelected
                  ? 'bg-blue-50 ring-1 ring-blue-200'
                  : 'hover:bg-gray-50'
              }`}
              onClick={() => onSelectEntry?.(entry)}
              data-testid={`audit-entry-${entry.id}`}
            >
              {/* 时间线节点 */}
              <div
                className={`absolute left-2 top-4 h-5 w-5 rounded-full border-2 border-white ${opConfig.split(' ')[0]}`}
              />

              <div className="flex-1 min-w-0">
                {/* 标题行 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${opConfig}`}
                  >
                    {OPERATION_LABELS[entry.operationType]}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${reviewConfig.className}`}
                  >
                    {reviewConfig.label}
                  </span>
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {entry.nodeName}
                  </span>
                </div>

                {/* 变更摘要 */}
                {entry.changeSummary && (
                  <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                    {entry.changeSummary}
                  </p>
                )}

                {/* 元信息 */}
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                  <span>{entry.actor}</span>
                  <span>{formatTimestamp(entry.timestamp)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
