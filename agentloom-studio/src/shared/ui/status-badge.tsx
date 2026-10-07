import { forwardRef } from 'react'
import { cn } from '@/shared/lib/utils'
import { Badge, type BadgeProps } from './badge'

/**
 * 状态语气 — 各 feature 的状态枚举（执行状态、密钥状态、上架状态…）先映射到
 * 这 6 个语气之一，再由本组件统一出样式；feature 内不再各自维护 cva 配色表。
 */
export type StatusTone =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'

const TONE_TO_VARIANT: Record<StatusTone, NonNullable<BadgeProps['variant']>> = {
  neutral: 'secondary',
  primary: 'default',
  success: 'success',
  warning: 'warning',
  error: 'error',
  info: 'info',
}

const DOT_CLASS: Record<StatusTone, string> = {
  neutral: 'bg-muted-foreground',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  info: 'bg-info',
}

export interface StatusDotProps {
  tone: StatusTone
  /** 进行中状态用呼吸动画（motion 的 reducedMotion 不覆盖 CSS 动画，由 index.css 处理） */
  pulse?: boolean
  className?: string
}

export function StatusDot({ tone, pulse = false, className }: StatusDotProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-1.5 shrink-0 rounded-full',
        DOT_CLASS[tone],
        pulse && 'animate-pulse',
        className,
      )}
    />
  )
}

export interface StatusBadgeProps
  extends Omit<BadgeProps, 'variant' | 'tone'> {
  tone: StatusTone
  /** 文字前渲染状态圆点 */
  dot?: boolean
  pulse?: boolean
}

export const StatusBadge = forwardRef<HTMLSpanElement, StatusBadgeProps>(
  function StatusBadge(
    { tone, dot = false, pulse = false, children, ...props },
    ref,
  ) {
    return (
      <Badge ref={ref} variant={TONE_TO_VARIANT[tone]} {...props}>
        {dot ? <StatusDot tone={tone} pulse={pulse} /> : null}
        {children}
      </Badge>
    )
  },
)
