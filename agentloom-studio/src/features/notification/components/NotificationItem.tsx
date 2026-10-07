import { cva } from 'class-variance-authority'
import { formatRelativeTime } from '@/features/canvas'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import {
  FALLBACK_TYPE_META,
  NOTIFICATION_TYPE_META,
} from '../lib/notificationMeta'
import type { NotificationType } from '../types'

interface NotificationItemProps {
  notification: NotificationType
  onSelect: (notification: NotificationType) => void
  disabled?: boolean
}

const itemVariants = cva(
  'flex h-auto w-full items-start justify-start gap-3 whitespace-normal rounded-none border-l-2 px-4 py-3 text-left font-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:pointer-events-none disabled:opacity-60',
  {
    variants: {
      unread: {
        true: 'border-l-primary bg-primary/10 hover:bg-primary/15',
        false:
          'border-l-transparent bg-transparent hover:border-l-border hover:bg-muted',
      },
    },
  },
)

const iconContainerVariants = cva(
  'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border',
  {
    variants: {
      tone: {
        success: 'border-success/30 bg-success/10 text-success',
        error: 'border-error/30 bg-error/10 text-error',
        warning: 'border-warning/30 bg-warning/10 text-warning',
        info: 'border-info/30 bg-info/10 text-info',
      },
    },
  },
)

export function NotificationItem({
  notification,
  onSelect,
  disabled = false,
}: NotificationItemProps) {
  const meta =
    NOTIFICATION_TYPE_META[notification.type] ?? FALLBACK_TYPE_META
  const Icon = meta.icon

  return (
    <Button
      variant="ghost"
      className={cn(itemVariants({ unread: !notification.isRead }))}
      onClick={() => onSelect(notification)}
      disabled={disabled}
      data-testid={`notification-item-${notification.id}`}
    >
      <div className={cn(iconContainerVariants({ tone: meta.tone }))}>
        <Icon aria-hidden="true" />
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
    </Button>
  )
}
