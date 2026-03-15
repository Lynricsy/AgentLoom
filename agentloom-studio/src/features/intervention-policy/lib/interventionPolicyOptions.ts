import type {
  InterventionPolicySource,
  InterventionRole,
  NotifyChannel,
  TimeoutAction,
} from '../types'

export const DEFAULT_INTERVENTION_POLICY = {
  allowedRoles: ['owner', 'admin'] as InterventionRole[],
  timeoutSeconds: 86400,
  timeoutAction: 'reject' as TimeoutAction,
  escalateToRole: null as InterventionRole | null,
  notifyChannels: ['in_app'] as NotifyChannel[],
}

export const INTERVENTION_ROLE_LABELS: Record<InterventionRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  creator: 'Creator',
  operator: 'Operator',
  viewer: 'Viewer',
}

export const TIMEOUT_ACTION_LABELS: Record<TimeoutAction, string> = {
  approve: '自动批准',
  reject: '自动拒绝',
  escalate: '升级到指定角色',
}

export const NOTIFY_CHANNEL_LABELS: Record<NotifyChannel, string> = {
  in_app: '站内通知',
  email: '邮件',
  push: '推送',
}

export const POLICY_SOURCE_LABELS: Record<InterventionPolicySource, string> = {
  node: '节点覆盖',
  workflow: '工作流策略',
  system_default: '系统默认',
}

export const TIMEOUT_OPTIONS = [
  { value: 300, label: '5 分钟' },
  { value: 900, label: '15 分钟' },
  { value: 1800, label: '30 分钟' },
  { value: 3600, label: '1 小时' },
  { value: 14400, label: '4 小时' },
  { value: 43200, label: '12 小时' },
  { value: 86400, label: '24 小时' },
  { value: 172800, label: '48 小时' },
  { value: 604800, label: '7 天' },
] as const

const timeoutLabelMap = new Map<number, string>(TIMEOUT_OPTIONS.map((option) => [option.value, option.label]))

export function formatInterventionTimeoutLabel(timeoutSeconds: number): string {
  return timeoutLabelMap.get(timeoutSeconds) ?? `${timeoutSeconds} 秒`
}
