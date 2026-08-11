import { useMemo } from 'react'
import { BellRing } from 'lucide-react'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { Spinner } from '@/shared/components/spinner/Spinner'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Skeleton } from '@/shared/ui/skeleton'
import { Switch } from '@/shared/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table'
import { useToast } from '@/shared/ui/toast'
import { useUpsertPreference } from '../api/notificationMutations'
import { useNotificationPreferences } from '../api/notificationQueries'
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPE_META,
  NOTIFICATION_TYPES,
} from '../lib/notificationMeta'
import type {
  NotificationChannel,
  NotificationPreference,
  NotificationTypeEnum,
} from '../types'

const PAGE_DESCRIPTION = '按通知类型分渠道控制提醒方式，开关改动会立即保存。'

/** 服务端未持久化的格子按「开启」处理（notification.processor 无偏好即放行） */
const DEFAULT_ENABLED = true

export function NotificationPreferencesPage() {
  const { notify } = useToast()
  const { data, isLoading, isError, error, refetch, isFetching } =
    useNotificationPreferences()
  const upsertMutation = useUpsertPreference()

  const preferences = useMemo<NotificationPreference[]>(
    () => data?.data ?? [],
    [data?.data],
  )

  const enabledMap = useMemo(() => {
    const map = new Map<string, boolean>()

    for (const preference of preferences) {
      map.set(
        `${preference.type}:${preference.channel}`,
        preference.enabled,
      )
    }

    return map
  }, [preferences])

  /** 行序以本地枚举全集为准，服务端若返回未收录的类型则追加在末尾 */
  const rowTypes = useMemo<string[]>(() => {
    const extras = preferences
      .map((preference) => preference.type as string)
      .filter(
        (type) => !NOTIFICATION_TYPES.includes(type as NotificationTypeEnum),
      )

    return [...NOTIFICATION_TYPES, ...new Set(extras)]
  }, [preferences])

  function handleToggle(
    type: string,
    channel: NotificationChannel,
    enabled: boolean,
  ) {
    upsertMutation.mutate(
      { type: type as NotificationTypeEnum, channel, enabled },
      {
        onError: (mutationError) => {
          notify({
            variant: 'error',
            title: '保存通知偏好失败',
            description:
              mutationError instanceof Error
                ? mutationError.message
                : '开关已回滚，请稍后重试',
          })
        },
      },
    )
  }

  if (isLoading) {
    return (
      <div
        className="space-y-6 px-4 py-6 sm:px-6 lg:px-8"
        data-testid="notification-preferences-page"
      >
        <PageHeader icon={BellRing} title="通知偏好" description="加载通知偏好中…" />
        <Card>
          <CardContent className="space-y-3 p-4">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-10 rounded-card" />
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isError) {
    return (
      <div
        className="space-y-6 px-4 py-6 sm:px-6 lg:px-8"
        data-testid="notification-preferences-page"
      >
        <PageHeader icon={BellRing} title="通知偏好" description={PAGE_DESCRIPTION} />
        <Card className="border-error/40">
          <CardContent className="space-y-3 p-5">
            <p className="text-sm font-medium text-foreground">加载通知偏好失败</p>
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
      </div>
    )
  }

  return (
    <div
      className="space-y-6 px-4 py-6 sm:px-6 lg:px-8"
      data-testid="notification-preferences-page"
    >
      <PageHeader
        icon={BellRing}
        title="通知偏好"
        description={PAGE_DESCRIPTION}
        actions={
          upsertMutation.isPending ? (
            <span className="flex items-center gap-2 text-xs text-muted">
              <Spinner size="sm" label="保存中" />
              保存中
            </span>
          ) : null
        }
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-56">通知类型</TableHead>
              {NOTIFICATION_CHANNELS.map((channel) => (
                <TableHead key={channel.value} className="w-28 text-center">
                  <span className="block text-foreground">{channel.label}</span>
                  <span className="block text-[11px] font-normal text-muted">
                    {channel.description}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {rowTypes.map((type) => {
              const meta = NOTIFICATION_TYPE_META[type as NotificationTypeEnum]

              return (
                <TableRow key={type} className="hover:bg-transparent">
                  <TableCell className="align-top">
                    <span className="block text-sm font-medium text-foreground">
                      {meta?.label ?? type}
                    </span>
                    {meta ? (
                      <span className="mt-0.5 block text-xs text-muted">
                        {meta.description}
                      </span>
                    ) : null}
                  </TableCell>

                  {NOTIFICATION_CHANNELS.map((channel) => {
                    const enabled =
                      enabledMap.get(`${type}:${channel.value}`) ??
                      DEFAULT_ENABLED

                    return (
                      <TableCell key={channel.value} className="text-center">
                        <Switch
                          className="mx-auto"
                          checked={enabled}
                          onCheckedChange={(next) =>
                            handleToggle(type, channel.value, next)
                          }
                          aria-label={`${meta?.label ?? type} · ${channel.label}`}
                          data-testid={`preference-${type}-${channel.value}`}
                        />
                      </TableCell>
                    )
                  })}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      <p className="text-xs text-muted">
        未显式设置过的渠道默认开启；关闭后该类型的对应渠道提醒将不再送达。
      </p>
    </div>
  )
}
