import { apiClient, toSnakeBody } from '@/shared/api/client'
import type { ApiResponse, PaginatedResponse } from '@/shared/types/api'
import type {
  NotificationListParams,
  NotificationPreference,
  NotificationType,
  UnreadCountPayload,
  UpsertNotificationPreferenceInput,
} from '../types'

const BASE_PATH = 'notifications'

function createSearchParams(params?: NotificationListParams): Record<string, string> {
  const searchParams: Record<string, string> = {}

  if (params?.page != null) {
    searchParams.page = String(params.page)
  }

  if (params?.pageSize != null) {
    searchParams.page_size = String(params.pageSize)
  }

  if (params?.isRead != null) {
    searchParams.is_read = String(params.isRead)
  }

  return searchParams
}

export async function listNotifications(
  params?: NotificationListParams,
): Promise<PaginatedResponse<NotificationType>> {
  return apiClient
    .get(BASE_PATH, {
      searchParams: createSearchParams(params),
    })
    .json<PaginatedResponse<NotificationType>>()
}

export async function getUnreadCount(): Promise<ApiResponse<UnreadCountPayload>> {
  return apiClient
    .get(`${BASE_PATH}/unread-count`)
    .json<ApiResponse<UnreadCountPayload>>()
}

export async function markAsRead(
  id: string,
): Promise<ApiResponse<NotificationType>> {
  return apiClient
    .patch(`${BASE_PATH}/${id}/read`)
    .json<ApiResponse<NotificationType>>()
}

export async function markAllAsRead(): Promise<ApiResponse<void>> {
  return apiClient.patch(`${BASE_PATH}/read-all`).json<ApiResponse<void>>()
}

export async function getPreferences(): Promise<
  ApiResponse<NotificationPreference[]>
> {
  return apiClient
    .get(`${BASE_PATH}/preferences`)
    .json<ApiResponse<NotificationPreference[]>>()
}

export async function upsertPreference(
  data: UpsertNotificationPreferenceInput,
): Promise<ApiResponse<NotificationPreference>> {
  return apiClient
    .put(`${BASE_PATH}/preferences`, {
      json: toSnakeBody(data),
    })
    .json<ApiResponse<NotificationPreference>>()
}
