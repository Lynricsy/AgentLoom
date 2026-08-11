/** 与服务端 `notification_type_enum`（database/schema/notifications.schema.ts）逐项对齐 */
export type NotificationTypeEnum =
  | 'execution_completed'
  | 'execution_failed'
  | 'intervention_required'
  | 'resource_governance_execution_blocked'
  | 'resource_governance_quota_updated'
  | 'resource_governance_controls_updated'
  | 'resource_governance_execution_terminated'
  | 'system'

/** 与服务端 `UpsertPreferenceDto` 的 channel 枚举对齐 */
export type NotificationChannel = 'in_app' | 'email' | 'push'

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

export type UpsertNotificationPreferenceInput = Pick<
  NotificationPreference,
  'type' | 'channel' | 'enabled'
>
