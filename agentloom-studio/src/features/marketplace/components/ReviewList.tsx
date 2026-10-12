import { MessageSquare } from 'lucide-react'

import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { formatDate } from '@/shared/lib/format'
import type { MarketplaceReview } from '../types'
import { StarRating } from './StarRating'

interface ReviewListProps {
  reviews: MarketplaceReview[]
}

export function ReviewList({ reviews }: ReviewListProps) {
  if (reviews.length === 0) {
    return (
      <div data-testid="review-list-empty">
        <EmptyState
          icon={MessageSquare}
          title="还没有评价"
          description="来写下第一条反馈吧。"
          className="py-8"
        />
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="review-list">
      {reviews.map((review) => (
        <article
          key={review.id}
          className="rounded-lg border border-border bg-muted p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className="truncate text-sm font-medium text-foreground"
                title={review.author.displayName}
              >
                {review.author.displayName}
              </p>
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                {formatDate(review.createdAt)}
              </p>
            </div>
            <StarRating rating={review.rating} size="sm" />
          </div>

          {review.content ? (
            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {review.content}
            </p>
          ) : (
            <p className="mt-3 text-sm italic text-muted-foreground">
              这条评价没有留下文字内容。
            </p>
          )}
        </article>
      ))}
    </div>
  )
}
