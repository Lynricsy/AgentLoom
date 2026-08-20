import type {
  UpsertPreferenceDto,
  UpsertPreferenceDtoChannelEnum,
  UpsertPreferenceDtoTypeEnum,
} from '@agentloom/api-client'

/** 与服务端 `notification_type_enum`（database/schema/notifications.schema.ts）逐项对齐 */
export type NotificationTypeEnum = UpsertPreferenceDtoTypeEnum

/** 与服务端 `UpsertPreferenceDto` 的 channel 枚举对齐 */
export type NotificationChannel = UpsertPreferenceDtoChannelEnum

export interface NotificationType {
  id: string
  tenantId: string
  userId: string
  type: NotificationTypeEnum
  title: string
  body: Record<string, unknown> | null
  isRead: boolean
  createdAt: string
}

export interface NotificationPreference {
  id: string
  userId: string
  tenantId: string
  type: NotificationTypeEnum
  channel: NotificationChannel
  enabled: boolean
}

export interface NotificationListParams {
  page?: number
  pageSize?: number
  isRead?: boolean
}

export interface UnreadCountPayload {
  count: number
}

/** PUT /notifications/preferences 请求体（生成模型） */
export type UpsertNotificationPreferenceInput = UpsertPreferenceDto
