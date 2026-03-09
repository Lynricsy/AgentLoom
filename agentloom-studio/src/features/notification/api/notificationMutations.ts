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
    UpsertNotificationPreferenceInput
  >({
    mutationKey: ['notifications', 'upsert-preference'],
    mutationFn: (input) => upsertPreference(input),
    gcTime: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: notificationKeys.preferences(),
      })
    },
  })
}
