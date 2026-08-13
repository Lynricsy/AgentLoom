import { memo, type ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

export type NodeBadgeVariant = 'status' | 'info'

export type NodeBadgeColor =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'info'
  | 'muted'

const COLOR_CLASSES: Record<NodeBadgeColor, string> = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-error/10 text-error',
  info: 'bg-info/10 text-info',
  muted: 'bg-muted/70 text-muted-foreground',
}

const VARIANT_CLASSES: Record<NodeBadgeVariant, string> = {
  status: 'rounded-full',
  info: 'rounded',
}

interface NodeBadgeProps {
  variant?: NodeBadgeVariant
  color?: NodeBadgeColor
  className?: string
  children: ReactNode
}

export const NodeBadge = memo(function NodeBadge({
  variant = 'info',
  color = 'default',
  className,
  children,
}: NodeBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium',
        VARIANT_CLASSES[variant],
        COLOR_CLASSES[color],
        className,
      )}
    >
      {children}
    </span>
  )
})
