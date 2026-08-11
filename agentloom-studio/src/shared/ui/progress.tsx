import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cn } from '@/shared/lib/utils'

export interface ProgressProps
  extends ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  /** 进度条填充色，默认品牌色；可传 `var(--color-node-agent)` 等类别色 */
  tone?: string
}

export const Progress = forwardRef<
  ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(function Progress({ className, value, max = 100, tone, ...props }, ref) {
  // value 为 null/undefined 表示不确定态，需原样透传给 Radix；有值时夹到 [0, max] 避免其告警
  const safeValue =
    value === null || value === undefined
      ? value
      : Math.min(max, Math.max(0, value))
  const percent = ((safeValue ?? 0) / max) * 100

  return (
    <ProgressPrimitive.Root
      ref={ref}
      value={safeValue}
      max={max}
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-surface-elevated',
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full w-full flex-1 rounded-full bg-primary transition-transform duration-300 ease-out"
        style={{
          transform: `translateX(-${100 - percent}%)`,
          ...(tone ? { backgroundColor: tone } : null),
        }}
      />
    </ProgressPrimitive.Root>
  )
})
