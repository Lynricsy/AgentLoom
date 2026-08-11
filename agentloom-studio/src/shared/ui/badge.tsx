import { forwardRef, type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/shared/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap transition-colors',
  {
    variants: {
      variant: {
        default: 'border-primary/25 bg-primary/10 text-primary',
        secondary: 'border-border bg-surface-elevated text-muted',
        success: 'border-success/25 bg-success/10 text-success',
        warning: 'border-warning/25 bg-warning/10 text-warning',
        error: 'border-error/25 bg-error/10 text-error',
        info: 'border-info/25 bg-info/10 text-info',
        outline: 'border-border bg-transparent text-foreground',
      },
      size: {
        sm: 'px-1.5 py-0.5 text-[10px] leading-none',
        default: 'px-2 py-0.5 text-xs',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /**
   * 任意色着色（如节点类别色 `var(--color-node-agent)`）。
   * 传入后覆盖 variant 配色，用 color-mix 生成边框/底色。
   */
  tone?: string
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant, size, tone, style, ...props },
  ref,
) {
  const toneStyle = tone
    ? {
        color: tone,
        borderColor: `color-mix(in srgb, ${tone} 30%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${tone} 12%, transparent)`,
        ...style,
      }
    : style

  return (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant, size }), className)}
      style={toneStyle}
      {...props}
    />
  )
})

export { badgeVariants }
