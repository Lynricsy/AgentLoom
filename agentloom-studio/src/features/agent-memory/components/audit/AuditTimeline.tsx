import { useMemo } from 'react';
import { motion } from 'motion/react';
import { FileClock } from 'lucide-react';
import { EmptyState } from '@/shared/components/empty-state/EmptyState';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';
import { staggerList } from '@/shared/lib/motion';
import { cn } from '@/shared/lib/utils';
import type { AuditLogEntry, AuditOperationType, ReviewStatus } from './types';

// --- 操作类型配置（全部走设计令牌，禁止硬编码调色板类） ---

const OPERATION_LABELS: Record<AuditOperationType, string> = {
  create: '创建',
  update: '更新',
  delete: '删除',
  rollback: '回滚',
};

/** 操作类型 → 语义色令牌 */
export const OPERATION_TONES: Record<AuditOperationType, string> = {
  create: 'var(--color-success)',
  update: 'var(--color-info)',
  delete: 'var(--color-error)',
  rollback: 'var(--color-warning)',
};

const REVIEW_STATUS_META: Record<
  ReviewStatus,
  { label: string; tone: string }
> = {
  pending: { label: '待审核', tone: 'var(--color-warning)' },
  approved: { label: '已批准', tone: 'var(--color-success)' },
  rejected: { label: '已拒绝', tone: 'var(--color-error)' },
};

export { REVIEW_STATUS_META };

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
      <div className="space-y-4 p-3" data-testid="audit-timeline-loading">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/2 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (sortedEntries.length === 0) {
    return (
      <div className="p-3" data-testid="audit-timeline-empty">
        <EmptyState
          icon={FileClock}
          tone="var(--color-node-memory)"
          title="暂无审计记录"
          description="记忆节点发生变更后，这里会按时间倒序记录每一次操作。"
        />
      </div>
    );
  }

  return (
    <div className="relative p-3" data-testid="audit-timeline">
      {/* 时间线竖线 */}
      <div
        aria-hidden
        className="absolute bottom-6 left-[26px] top-6 w-px bg-border"
      />

      <div className="space-y-2">
        {sortedEntries.map((entry, index) => {
          const tone = OPERATION_TONES[entry.operationType];
          const reviewMeta = REVIEW_STATUS_META[entry.reviewStatus];
          const isSelected = selectedEntryId === entry.id;

          return (
            <motion.button
              key={entry.id}
              type="button"
              {...staggerList(index)}
              className={cn(
                'relative flex w-full gap-3 rounded-card border p-3 pl-9 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                isSelected
                  ? 'border-primary/40 bg-primary/10'
                  : 'border-transparent hover:bg-surface-elevated',
              )}
              aria-current={isSelected ? 'true' : undefined}
              onClick={() => onSelectEntry?.(entry)}
              data-testid={`audit-entry-${entry.id}`}
            >
              {/* 时间线节点 */}
              <span
                aria-hidden
                className="absolute left-[10px] top-[18px] h-2.5 w-2.5 rounded-full ring-2 ring-surface"
                style={{ backgroundColor: tone }}
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge size="sm" tone={tone}>
                    {OPERATION_LABELS[entry.operationType]}
                  </Badge>
                  <Badge size="sm" tone={reviewMeta.tone}>
                    {reviewMeta.label}
                  </Badge>
                  <span className="truncate text-sm font-medium text-foreground">
                    {entry.nodeName}
                  </span>
                </div>

                {entry.changeSummary && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted">
                    {entry.changeSummary}
                  </p>
                )}

                <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>{entry.actor}</span>
                  <span>{formatTimestamp(entry.timestamp)}</span>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
