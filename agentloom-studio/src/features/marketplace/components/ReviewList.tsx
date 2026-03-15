import type { MarketplaceReview } from '../types'
import { StarRating } from './StarRating'

interface ReviewListProps {
  reviews: MarketplaceReview[]
}

export function ReviewList({ reviews }: ReviewListProps) {
  if (reviews.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed border-border bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground"
        data-testid="review-list-empty"
      >
        还没有评价，来写下第一条反馈吧。
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="review-list">
      {reviews.map((review) => (
        <article
          key={review.id}
          className="rounded-lg border border-border bg-card/60 p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                {review.author.displayName}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(review.createdAt).toLocaleDateString('zh-CN')}
              </p>
            </div>
            <StarRating rating={review.rating} size="sm" />
          </div>

          {review.content ? (
            <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
              {review.content}
            </p>
          ) : (
            <p className="mt-3 text-sm italic text-muted-foreground/80">
              这条评价没有留下文字内容。
            </p>
          )}
        </article>
      ))}
    </div>
  )
}
