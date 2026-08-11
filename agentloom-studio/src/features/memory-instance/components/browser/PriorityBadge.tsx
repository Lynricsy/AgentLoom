import { Star } from 'lucide-react'
import { Badge } from '@/shared/ui/badge'
import { cn } from '@/shared/lib/utils'

interface PriorityBadgeProps {
  priority: number | null | undefined
  size?: 'sm' | 'lg'
}

/** 优先级越小越靠前：0 为最高优先级，用错误色示警，其余依次降温 */
export function PriorityBadge({ priority, size = 'sm' }: PriorityBadgeProps) {
  if (priority === null || priority === undefined) return null

  const variant =
    priority === 0
      ? 'error'
      : priority <= 2
        ? 'warning'
        : priority <= 5
          ? 'info'
          : 'secondary'

  return (
    <Badge
      variant={variant}
      className={cn(
        'rounded-md font-mono font-semibold',
        size === 'lg' ? 'gap-1.5 px-2.5 py-1 text-xs' : 'gap-1 px-1.5 py-0.5 text-[10px]',
      )}
    >
      <Star size={size === 'lg' ? 12 : 9} />
      {priority}
    </Badge>
  )
}
