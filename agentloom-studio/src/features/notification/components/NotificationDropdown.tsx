import { useCallback, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'
import {
  useMarkAllAsRead,
  useMarkAsRead,
} from '../api/notificationMutations'
import { useNotifications } from '../api/notificationQueries'
import { useNotificationActions } from '../stores/notificationStore'
import type { NotificationType } from '../types'
import { NotificationItem } from './NotificationItem'

function getTimelineUrl(body: Record<string, unknown> | null): string | null {
  return typeof body?.timelineUrl === 'string' ? body.timelineUrl : null
}

export function NotificationDropdown() {
  const { setDropdownOpen } = useNotificationActions()
  const {
    data,
    isLoading,
    error,
  } = useNotifications({ page: 1, pageSize: 20 })
  const markAsReadMutation = useMarkAsRead()
  const markAllAsReadMutation = useMarkAllAsRead()

  const visibleNotifications = useMemo(
    () => (data?.data ?? []).slice(0, 20),
    [data?.data],
  )
  const unreadCount = useMemo(
    () => visibleNotifications.filter((item) => !item.isRead).length,
    [visibleNotifications],
  )

  const handleSelect = useCallback(
    async (notification: NotificationType) => {
      if (!notification.isRead) {
        try {
          await markAsReadMutation.mutateAsync(notification.id)
        } catch {
          return
        }
      }

      const timelineUrl = getTimelineUrl(notification.body)

      if (timelineUrl) {
        setDropdownOpen(false)
        globalThis.location.assign(timelineUrl)
      }
    },
    [markAsReadMutation, setDropdownOpen],
  )

  const handleMarkAllAsRead = useCallback(async () => {
    if (!unreadCount) {
      return
    }

    await markAllAsReadMutation.mutateAsync().catch(() => undefined)
  }, [markAllAsReadMutation, unreadCount])

  return (
    <div
      className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border/70 bg-surface-elevated shadow-2xl backdrop-blur"
      data-testid="notification-dropdown"
    >
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">通知中心</p>
          <p className="text-xs text-muted-foreground">最近 20 条消息</p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleMarkAllAsRead()}
          disabled={!unreadCount || markAllAsReadMutation.isPending}
          data-testid="mark-all-read"
        >
          {markAllAsReadMutation.isPending ? '处理中...' : '全部标记已读'}
        </Button>
      </div>

      {isLoading && visibleNotifications.length === 0 ? (
        <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载通知中...
        </div>
      ) : null}

      {!isLoading && error && visibleNotifications.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-error">
          通知加载失败，请稍后重试
        </div>
      ) : null}

      {!isLoading && visibleNotifications.length === 0 && !error ? (
        <div
          className="px-4 py-10 text-center text-sm text-muted-foreground"
          data-testid="notification-empty"
        >
          暂无通知
        </div>
      ) : null}

      {visibleNotifications.length > 0 ? (
        <div
          className={cn(
            'max-h-96 overflow-y-auto',
            '[&>*+*]:border-t [&>*+*]:border-border/40',
          )}
        >
          {visibleNotifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onSelect={(item) => void handleSelect(item)}
              disabled={markAsReadMutation.isPending}
            />
          ))}
        </div>
      ) : null}

      <div className="border-t border-border/60 px-2 py-2">
        <Link
          to="/notifications"
          onClick={() => setDropdownOpen(false)}
          className="flex items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-surface-elevated"
          data-testid="notification-view-all"
        >
          查看全部通知
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}
