import { useState } from 'react'
import { Bell, BellOff, CheckCheck } from 'lucide-react'
import { formatRelativeTime } from '@/features/canvas'
import {
  DataTable,
  type DataTableColumn,
} from '@/shared/components/data-table/DataTable'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { useToast } from '@/shared/ui/toast'
import { cn } from '@/shared/lib/utils'
import {
  useMarkAllAsRead,
  useMarkAsRead,
} from '../api/notificationMutations'
import { useNotifications, useUnreadCount } from '../api/notificationQueries'
import {
  FALLBACK_TYPE_META,
  NOTIFICATION_TYPE_META,
  type NotificationTone,
} from '../lib/notificationMeta'
import type { NotificationType } from '../types'

const PAGE_SIZE = 20
const PAGE_DESCRIPTION = '按时间倒序查看全部通知，可单条或批量标记为已读。'

type NotificationFilter = 'all' | 'unread'

const TONE_ICON_CLASS: Record<NotificationTone, string> = {
  success: 'border-success/30 bg-success/10 text-success',
  error: 'border-error/30 bg-error/10 text-error',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  info: 'border-info/30 bg-info/10 text-info',
}

export function NotificationCenterPage() {
  const { notify } = useToast()
  const [filter, setFilter] = useState<NotificationFilter>('all')
  const [page, setPage] = useState(1)

  const { data, isLoading, isError, error, refetch, isFetching } =
    useNotifications({
      page,
      pageSize: PAGE_SIZE,
      isRead: filter === 'unread' ? false : undefined,
    })
  const { data: unreadData } = useUnreadCount()
  const markAsReadMutation = useMarkAsRead()
  const markAllAsReadMutation = useMarkAllAsRead()

  const notifications = data?.data ?? []
  const total = data?.meta.total ?? notifications.length
  const unreadCount = unreadData?.data.count ?? 0

  function handleFilterChange(next: string) {
    setFilter(next === 'unread' ? 'unread' : 'all')
    setPage(1)
  }

  function handleMarkAsRead(notification: NotificationType) {
    markAsReadMutation.mutate(notification.id, {
      onError: (mutationError) => {
        notify({
          variant: 'error',
          title: '标记已读失败',
          description:
            mutationError instanceof Error
              ? mutationError.message
              : '请稍后重试',
        })
      },
    })
  }

  function handleMarkAllAsRead() {
    markAllAsReadMutation.mutate(undefined, {
      onSuccess: () => {
        notify({ variant: 'success', description: '已将全部通知标记为已读' })
      },
      onError: (mutationError) => {
        notify({
          variant: 'error',
          title: '全部标记已读失败',
          description:
            mutationError instanceof Error
              ? mutationError.message
              : '请稍后重试',
        })
      },
    })
  }

  const columns: DataTableColumn<NotificationType>[] = [
    {
      key: 'notification',
      header: '通知',
      className: 'w-full max-w-0',
      cell: (notification) => {
        const meta =
          NOTIFICATION_TYPE_META[notification.type] ?? FALLBACK_TYPE_META
        const Icon = meta.icon
        const timelineUrl =
          typeof notification.body?.timelineUrl === 'string'
            ? notification.body.timelineUrl
            : null

        return (
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className={cn(
                'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border',
                TONE_ICON_CLASS[meta.tone],
              )}
            >
              <Icon className="h-4 w-4" />
            </span>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {notification.isRead ? null : (
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                  />
                )}
                <span
                  className={cn(
                    'truncate text-sm text-foreground',
                    notification.isRead ? 'font-normal' : 'font-semibold',
                  )}
                >
                  {notification.title}
                </span>
                {notification.isRead ? null : (
                  <Badge size="sm" variant="default">
                    未读
                  </Badge>
                )}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="md:hidden">{meta.label}</span>
                <span className="sm:hidden">
                  {formatRelativeTime(new Date(notification.createdAt))}
                </span>
                {timelineUrl ? (
                  <a
                    href={timelineUrl}
                    className="text-primary transition-colors hover:text-primary-hover"
                  >
                    查看详情
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        )
      },
    },
    {
      key: 'type',
      header: '类型',
      className: 'w-36',
      hideBelow: 'md',
      cell: (notification) => {
        const meta =
          NOTIFICATION_TYPE_META[notification.type] ?? FALLBACK_TYPE_META

        return (
          <Badge variant={meta.tone} size="sm">
            {meta.label}
          </Badge>
        )
      },
    },
    {
      key: 'createdAt',
      header: '时间',
      className: 'w-28 whitespace-nowrap',
      hideBelow: 'sm',
      cell: (notification) => (
        <span
          className="text-xs text-muted"
          title={new Date(notification.createdAt).toLocaleString('zh-CN')}
        >
          {formatRelativeTime(new Date(notification.createdAt))}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      className: 'w-28 whitespace-nowrap text-right',
      cell: (notification) =>
        notification.isRead ? (
          <span className="text-xs text-muted">已读</span>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleMarkAsRead(notification)}
            disabled={markAsReadMutation.isPending}
            data-testid={`mark-read-${notification.id}`}
          >
            标记已读
          </Button>
        ),
    },
  ]

  return (
    <div
      className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8"
      data-testid="notification-center-page"
    >
      <PageHeader
        icon={Bell}
        title="通知中心"
        description={PAGE_DESCRIPTION}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllAsRead}
            disabled={unreadCount === 0 || markAllAsReadMutation.isPending}
            data-testid="mark-all-read"
          >
            <CheckCheck className="h-4 w-4" />
            {markAllAsReadMutation.isPending ? '处理中…' : '全部标记已读'}
          </Button>
        }
      />

      <Tabs
        value={filter}
        defaultValue="all"
        onValueChange={handleFilterChange}
        className="sm:max-w-64"
      >
        <TabsList>
          <TabsTrigger value="all">全部</TabsTrigger>
          <TabsTrigger value="unread">
            未读{unreadCount > 0 ? `（${unreadCount}）` : ''}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {isError ? (
        <Card className="border-error/40">
          <CardContent className="space-y-3 p-5">
            <p className="text-sm font-medium text-foreground">加载通知失败</p>
            <p className="text-xs font-medium text-error">
              {error instanceof Error ? error.message : '未知错误'}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              重试
            </Button>
          </CardContent>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={notifications}
          rowKey={(notification) => notification.id}
          loading={isLoading}
          skeletonRows={6}
          empty={
            <EmptyState
              icon={BellOff}
              title={filter === 'unread' ? '没有未读通知' : '暂无通知'}
              description={
                filter === 'unread'
                  ? '所有通知都已处理完毕，切换到「全部」可回顾历史消息。'
                  : '执行完成、需要介入与资源治理事件都会出现在这里；可在通知偏好中调整提醒渠道。'
              }
            />
          }
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total,
            onPageChange: setPage,
          }}
        />
      )}
    </div>
  )
}
