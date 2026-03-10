export type NotificationTypeEnum =
  | 'execution_completed'
  | 'execution_failed'
  | 'intervention_required'
  | 'system'

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
  channel: 'in_app' | 'email'
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
