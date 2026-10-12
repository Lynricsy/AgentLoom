import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

const alertVariants = cva('flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm', {
  variants: {
    variant: {
      info: 'border-info/30 bg-info/10 text-foreground',
      success: 'border-success/30 bg-success/10 text-foreground',
      warning: 'border-warning/30 bg-warning/10 text-foreground',
      error: 'border-error/30 bg-error/10 text-foreground',
    },
  },
  defaultVariants: {
    variant: 'info',
  },
})

type AlertVariant = NonNullable<VariantProps<typeof alertVariants>['variant']>

const ICONS: Record<AlertVariant, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
}

const ICON_COLOR: Record<AlertVariant, string> = {
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
}

export interface AlertProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'>,
    VariantProps<typeof alertVariants> {
  /** 覆盖默认图标；传 null 不渲染图标 */
  icon?: LucideIcon | null
  title?: ReactNode
}

/** 行内提示框（信息/成功/警告/错误），替代手写 `border-x/30 bg-x/10` 盒子 */
export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { variant, icon, title, children, className, ...props },
  ref,
) {
  const tone = variant ?? 'info'
  const Icon = icon === undefined ? ICONS[tone] : icon

  return (
    <div ref={ref} className={cn(alertVariants({ variant }), className)} {...props}>
      {Icon ? <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', ICON_COLOR[tone])} /> : null}
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="text-sm font-medium text-foreground">{title}</p> : null}
        {children ? (
          <div className="break-words text-sm text-muted-foreground">{children}</div>
        ) : null}
      </div>
    </div>
  )
})

export { alertVariants }
