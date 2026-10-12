import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { fadeIn } from '@/shared/lib/motion'
import { cn } from '@/shared/lib/utils'

export interface EmptyStateProps {
  icon: LucideIcon
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  /** 图标底色，默认品牌色；可传节点类别色统一页面语义 */
  tone?: string
  className?: string
  /** card：虚线框（独立空态）；plain：无边框（嵌在 DataTable/Card 内） */
  variant?: 'card' | 'plain'
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone,
  className,
  variant = 'card',
}: EmptyStateProps) {
  const accent = tone ?? 'var(--color-primary)'

  return (
    <motion.div
      {...fadeIn}
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-14 text-center',
        variant === 'card' && 'rounded-lg border border-dashed border-border',
        className,
      )}
    >
      <span
        aria-hidden
        className="grid size-12 place-items-center rounded-full"
        style={{
          backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)`,
          color: accent,
        }}
      >
        <Icon className="size-5" />
      </span>

      <div className="max-w-md space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>

      {action ? <div className="mt-1">{action}</div> : null}
    </motion.div>
  )
}
