import { Star } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

interface PriorityBadgeProps {
  priority: number | null | undefined
  size?: 'sm' | 'lg'
}

export function PriorityBadge({ priority, size = 'sm' }: PriorityBadgeProps) {
  if (priority === null || priority === undefined) return null

  const colors =
    priority === 0
      ? 'bg-rose-950/40 text-rose-400 border-rose-800/40'
      : priority <= 2
        ? 'bg-amber-950/30 text-amber-400 border-amber-800/30'
        : priority <= 5
          ? 'bg-sky-950/30 text-sky-400 border-sky-800/30'
          : 'bg-muted text-muted-foreground border-border'

  const sizeClass =
    size === 'lg' ? 'px-2.5 py-1 text-xs gap-1.5' : 'px-1.5 py-0.5 text-[10px] gap-1'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded border font-mono font-semibold',
        colors,
        sizeClass,
      )}
    >
      <Star size={size === 'lg' ? 12 : 9} />
      {priority}
    </span>
  )
}
