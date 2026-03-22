/**
 * 待审核列表组件
 */
import { useMemo } from 'react';
import type { PendingReview, AuditOperationType, ReviewStatus } from './types';

const OPERATION_LABELS: Record<AuditOperationType, string> = {
  create: '创建',
  update: '更新',
  delete: '删除',
  rollback: '回滚',
};

const REVIEW_STATUS_BADGE: Record<
  ReviewStatus,
  { label: string; className: string }
> = {
  pending: { label: '🟡 待审核', className: 'bg-yellow-100 text-yellow-800' },
  approved: { label: '✅ 已批准', className: 'bg-green-100 text-green-800' },
  rejected: { label: '❌ 已拒绝', className: 'bg-red-100 text-red-800' },
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
          <div key={i} className="animate-pulse rounded-lg border p-4">
            <div className="h-4 w-2/3 rounded bg-gray-200" />
            <div className="mt-2 h-3 w-1/3 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    );
  }

  if (sortedReviews.length === 0) {
    return (
      <div
        className="py-8 text-center text-gray-500"
        data-testid="pending-reviews-empty"
      >
        暂无待审核项
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="pending-reviews-list">
      <div className="mb-2 text-sm font-medium text-gray-600">
        共 {sortedReviews.length} 项待审核
      </div>

      {sortedReviews.map((review) => (
        <div
          key={review.id}
          className="cursor-pointer rounded-lg border border-gray-200 p-4 transition-colors hover:border-blue-300 hover:bg-blue-50/50"
          onClick={() => onSelectReview?.(review)}
          data-testid={`pending-review-${review.id}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">
                {review.nodeName}
              </span>
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                {OPERATION_LABELS[review.operationType]}
              </span>
            </div>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${REVIEW_STATUS_BADGE.pending.className}`}
            >
              {REVIEW_STATUS_BADGE.pending.label}
            </span>
          </div>

          {review.changeSummary && (
            <p className="mt-2 text-sm text-gray-600 line-clamp-2">
              {review.changeSummary}
            </p>
          )}

          <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
            <span>v{review.versionNumber}</span>
            <span>{review.actor}</span>
            <span>{formatTimestamp(review.createdAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
