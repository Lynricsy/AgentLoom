import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/shared/lib/utils'

export interface LabelProps extends HTMLAttributes<HTMLSpanElement> {}

export const Label = forwardRef<HTMLSpanElement, LabelProps>(function Label(
  { className, ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn('text-xs font-medium text-foreground', className)}
      {...props}
    />
  )
})
