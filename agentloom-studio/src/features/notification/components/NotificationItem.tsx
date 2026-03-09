import { cva } from 'class-variance-authority'
import {
  CheckCircle2,
  CircleAlert,
  Info,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { formatRelativeTime } from '@/features/canvas/lib/formatRelativeTime'
import { cn } from '@/shared/lib/utils'
import type { NotificationType } from '../types'

interface NotificationItemProps {
  notification: NotificationType
  onSelect: (notification: NotificationType) => void
  disabled?: boolean
}

const itemVariants = cva(
  'flex w-full items-start gap-3 border-l-2 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:pointer-events-none disabled:opacity-60',
  {
    variants: {
      unread: {
        true: 'border-l-sky-400 bg-sky-500/10 hover:bg-sky-500/15',
        false:
          'border-l-transparent bg-transparent hover:border-l-border hover:bg-muted/60',
      },
    },
  },
)

const iconContainerVariants = cva(
  'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border',
  {
    variants: {
      tone: {
        success: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300',
        error: 'border-rose-400/40 bg-rose-500/10 text-rose-300',
        warning: 'border-amber-400/40 bg-amber-500/10 text-amber-200',
        info: 'border-slate-400/40 bg-slate-500/10 text-slate-200',
      },
    },
  },
)

function getNotificationMeta(type: NotificationType['type']): {
  icon: LucideIcon
  tone: 'success' | 'error' | 'warning' | 'info'
  label: string
} {
  switch (type) {
    case 'execution_completed':
      return {
        icon: CheckCircle2,
        tone: 'success',
        label: '执行完成',
      }
    case 'execution_failed':
      return {
        icon: XCircle,
        tone: 'error',
        label: '执行失败',
      }
    case 'intervention_required':
      return {
        icon: CircleAlert,
        tone: 'warning',
        label: '需要人工介入',
      }
    default:
      return {
        icon: Info,
        tone: 'info',
        label: '系统通知',
      }
  }
}

export function NotificationItem({
  notification,
  onSelect,
  disabled = false,
}: NotificationItemProps) {
  const meta = getNotificationMeta(notification.type)
  const Icon = meta.icon

  return (
    <button
      type="button"
      className={cn(itemVariants({ unread: !notification.isRead }))}
      onClick={() => onSelect(notification)}
      disabled={disabled}
      data-testid={`notification-item-${notification.id}`}
    >
      <div className={cn(iconContainerVariants({ tone: meta.tone }))}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className={cn(
                'truncate text-sm text-foreground',
                notification.isRead ? 'font-medium' : 'font-semibold',
              )}
            >
              {notification.title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{meta.label}</p>
          </div>

          <span className="shrink-0 text-xs text-muted-foreground">
            {formatRelativeTime(new Date(notification.createdAt))}
          </span>
        </div>
      </div>
    </button>
  )
}
