import { useMemo } from 'react';
import { motion } from 'motion/react';
import { ClipboardCheck } from 'lucide-react';
import { EmptyState } from '@/shared/components/empty-state/EmptyState';
import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { staggerList } from '@/shared/lib/motion';
import { OPERATION_TONES, REVIEW_STATUS_META } from './AuditTimeline';
import type { PendingReview, AuditOperationType } from './types';

const OPERATION_LABELS: Record<AuditOperationType, string> = {
  create: '创建',
  update: '更新',
  delete: '删除',
  rollback: '回滚',
};

function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

interface PendingReviewsListProps {
  reviews: PendingReview[];
  isLoading: boolean;
  onSelectReview?: (review: PendingReview) => void;
}

export function PendingReviewsList({
  reviews,
  isLoading,
  onSelectReview,
}: PendingReviewsListProps) {
  const sortedReviews = useMemo(
    () =>
      [...reviews].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [reviews],
  );

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="pending-reviews-loading">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="space-y-2 p-4">
            <Skeleton className="h-4 w-2/3 rounded" />
            <Skeleton className="h-3 w-1/3 rounded" />
          </Card>
        ))}
      </div>
    );
  }

  if (sortedReviews.length === 0) {
    return (
      <div data-testid="pending-reviews-empty">
        <EmptyState
          icon={ClipboardCheck}
          tone="var(--color-success)"
          title="暂无待审核项"
          description="所有记忆变更都已处理完毕。"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="pending-reviews-list">
      <p className="text-sm font-medium text-muted">
        共 {sortedReviews.length} 项待审核
      </p>

      {sortedReviews.map((review, index) => (
        <motion.button
          key={review.id}
          type="button"
          {...staggerList(index)}
          className="block w-full rounded-card border border-border bg-card p-4 text-left shadow-node transition-all duration-150 hover:-translate-y-0.5 hover:border-border-hover hover:shadow-node-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          onClick={() => onSelectReview?.(review)}
          data-testid={`pending-review-${review.id}`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">
                {review.nodeName}
              </span>
              <Badge size="sm" tone={OPERATION_TONES[review.operationType]}>
                {OPERATION_LABELS[review.operationType]}
              </Badge>
            </div>
            <Badge size="sm" tone={REVIEW_STATUS_META.pending.tone}>
              {REVIEW_STATUS_META.pending.label}
            </Badge>
          </div>

          {review.changeSummary && (
            <p className="mt-2 line-clamp-2 text-sm text-muted">
              {review.changeSummary}
            </p>
          )}

          <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>v{review.versionNumber}</span>
            <span>{review.actor}</span>
            <span>{formatTimestamp(review.createdAt)}</span>
          </div>
        </motion.button>
      ))}
    </div>
  );
}
