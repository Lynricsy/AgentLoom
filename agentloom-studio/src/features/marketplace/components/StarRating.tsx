import { memo } from 'react'

import { cn } from '@/shared/lib/utils'

interface StarRatingProps {
  rating: number | null
  count?: number
  size?: 'sm' | 'md'
}

const STAR_SIZES = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
} as const

const TEXT_SIZES = {
  sm: 'text-xs',
  md: 'text-sm',
} as const

function StarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.075 3.31a1 1 0 00.95.69h3.481c.969 0 1.371 1.24.588 1.81l-2.816 2.046a1 1 0 00-.364 1.118l1.076 3.31c.3.922-.755 1.688-1.539 1.118l-2.817-2.046a1 1 0 00-1.175 0l-2.817 2.046c-.783.57-1.838-.196-1.539-1.118l1.076-3.31a1 1 0 00-.364-1.118L2.98 8.737c-.783-.57-.38-1.81.588-1.81h3.48a1 1 0 00.951-.69l1.05-3.31z" />
    </svg>
  )
}

export const StarRating = memo(function StarRating({
  rating,
  count,
  size = 'md',
}: StarRatingProps) {
  if (rating == null) {
    return (
      <span
        className={cn('text-muted-foreground', TEXT_SIZES[size])}
        data-testid="star-rating-empty"
      >
        暂无评分
      </span>
    )
  }

  return (
    <div
      className={cn('flex items-center gap-2 text-muted-foreground', TEXT_SIZES[size])}
      data-testid="star-rating"
    >
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }, (_, index) => {
          const fillRatio = Math.max(0, Math.min(1, rating - index))

          return (
            <span
              key={`star-${String(index)}`}
              className={cn('relative inline-flex', STAR_SIZES[size])}
              aria-hidden="true"
            >
              <StarIcon className={cn('text-border', STAR_SIZES[size])} />
              <span
                className="absolute inset-y-0 left-0 overflow-hidden"
                style={{ width: `${fillRatio * 100}%` }}
              >
                <StarIcon className={cn('text-warning', STAR_SIZES[size])} />
              </span>
            </span>
          )
        })}
      </div>
      <span className="font-medium text-foreground">{rating.toFixed(1)}</span>
      {count !== undefined ? <span>({count})</span> : null}
    </div>
  )
})
