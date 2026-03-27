import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/shared/lib/utils'

export const Skeleton = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function Skeleton({ className, ...props }, ref) {
    return <div ref={ref} className={cn('shimmer', className)} {...props} />
  },
)
