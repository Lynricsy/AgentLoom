import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  markAllAsRead,
  markAsRead,
  upsertPreference,
} from './notificationApi'
import { notificationKeys } from './notificationKeys'
import type {
  NotificationPreference,
  NotificationType,
  UpsertNotificationPreferenceInput,
} from '../types'
import type { ApiResponse } from '@/shared/types/api'

export function useMarkAsRead() {
  const queryClient = useQueryClient()

  return useMutation<ApiResponse<NotificationType>, Error, string>({
    mutationKey: ['notifications', 'mark-as-read'],
    mutationFn: (id) => markAsRead(id),
    gcTime: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: notificationKeys.lists(),
      })
      void queryClient.invalidateQueries({
        queryKey: notificationKeys.unreadCount(),
      })
    },
  })
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient()

  return useMutation<ApiResponse<void>, Error, void>({
    mutationKey: ['notifications', 'mark-all-as-read'],
    mutationFn: () => markAllAsRead(),
    gcTime: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: notificationKeys.lists(),
      })
      void queryClient.invalidateQueries({
        queryKey: notificationKeys.unreadCount(),
      })
    },
  })
}

export function useUpsertPreference() {
  const queryClient = useQueryClient()

  return useMutation<
    ApiResponse<NotificationPreference>,
    Error,
    UpsertNotificationPreferenceInput,
    { previous?: ApiResponse<NotificationPreference[]> }
  >({
    mutationKey: ['notifications', 'upsert-preference'],
    mutationFn: (input) => upsertPreference(input),
    gcTime: 0,
    // 偏好矩阵逐格提交：先落缓存让开关即时响应，失败时整份快照回滚
    onMutate: async (input) => {
      await queryClient.cancelQueries({
        queryKey: notificationKeys.preferences(),
      })

      const previous = queryClient.getQueryData<
        ApiResponse<NotificationPreference[]>
      >(notificationKeys.preferences())

      if (previous) {
        const existing = previous.data.find(
          (item) => item.type === input.type && item.channel === input.channel,
        )
        const next = existing
          ? previous.data.map((item) =>
              item === existing ? { ...item, enabled: input.enabled } : item,
            )
          : [
              ...previous.data,
              // 服务端未持久化过该格（默认开启），乐观补一条占位行；
              // 矩阵按 type+channel 取值，占位 id 与归属字段不参与渲染。
              {
                id: `pending:${input.type}:${input.channel}`,
                userId: '',
                tenantId: '',
                ...input,
              },
            ]

        queryClient.setQueryData(notificationKeys.preferences(), {
          ...previous,
          data: next,
        })
      }

      return { previous }
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          notificationKeys.preferences(),
          context.previous,
        )
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: notificationKeys.preferences(),
      })
    },
  })
}
