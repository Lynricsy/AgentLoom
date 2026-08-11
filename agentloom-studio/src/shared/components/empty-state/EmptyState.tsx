import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

export interface EmptyStateProps {
  icon: LucideIcon
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  /** 图标底色，默认品牌色；可传节点类别色统一页面语义 */
  tone?: string
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone,
  className,
}: EmptyStateProps) {
  const accent = tone ?? 'var(--color-primary)'

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-border px-6 py-14 text-center',
        className,
      )}
    >
      <span
        aria-hidden
        className="grid h-14 w-14 place-items-center rounded-full"
        style={{
          backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)`,
          color: accent,
        }}
      >
        <Icon className="h-7 w-7" />
      </span>

      <div className="max-w-md space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? <p className="text-xs text-muted">{description}</p> : null}
      </div>

      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
