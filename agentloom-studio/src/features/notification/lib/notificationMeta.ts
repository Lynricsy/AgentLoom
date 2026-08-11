import {
  Ban,
  CheckCircle2,
  CircleAlert,
  Gauge,
  Info,
  ShieldAlert,
  SlidersHorizontal,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import type { NotificationChannel, NotificationTypeEnum } from '../types'

/**
 * 通知类型全集 —— 与服务端 `notification_type_enum` 逐项对齐，顺序即偏好矩阵的行序。
 * 前端不自造清单：新增类型时先改服务端枚举，再同步此处与 NOTIFICATION_TYPE_META。
 */
export const NOTIFICATION_TYPES: readonly NotificationTypeEnum[] = [
  'execution_completed',
  'execution_failed',
  'intervention_required',
  'resource_governance_execution_blocked',
  'resource_governance_quota_updated',
  'resource_governance_controls_updated',
  'resource_governance_execution_terminated',
  'system',
]

/** 通知类型的语义色，映射到 success/error/warning/info 令牌 */
export type NotificationTone = 'success' | 'error' | 'warning' | 'info'

interface NotificationTypeMeta {
  label: string
  description: string
  icon: LucideIcon
  tone: NotificationTone
}

/** 通知类型的唯一展示来源 —— 铃铛下拉、通知中心与偏好矩阵共用 */
export const NOTIFICATION_TYPE_META: Record<
  NotificationTypeEnum,
  NotificationTypeMeta
> = {
  execution_completed: {
    label: '执行完成',
    description: '工作流或 Agent 执行成功结束',
    icon: CheckCircle2,
    tone: 'success',
  },
  execution_failed: {
    label: '执行失败',
    description: '执行过程中出错并中止',
    icon: XCircle,
    tone: 'error',
  },
  intervention_required: {
    label: '需要人工介入',
    description: '执行暂停，等待人工确认或补充输入',
    icon: CircleAlert,
    tone: 'warning',
  },
  resource_governance_execution_blocked: {
    label: '执行被拦截',
    description: '资源治理策略阻止了一次执行',
    icon: ShieldAlert,
    tone: 'warning',
  },
  resource_governance_quota_updated: {
    label: '配额变更',
    description: '组织的资源配额被调整',
    icon: Gauge,
    tone: 'info',
  },
  resource_governance_controls_updated: {
    label: '管控策略变更',
    description: '资源治理的管控项被修改',
    icon: SlidersHorizontal,
    tone: 'info',
  },
  resource_governance_execution_terminated: {
    label: '执行被终止',
    description: '资源治理策略强制终止了运行中的执行',
    icon: Ban,
    tone: 'error',
  },
  system: {
    label: '系统通知',
    description: '平台公告、维护与账户相关消息',
    icon: Info,
    tone: 'info',
  },
}

/** 未收录的类型（服务端枚举先行）退回中性展示，避免整行空白 */
export const FALLBACK_TYPE_META: NotificationTypeMeta = {
  label: '通知',
  description: '',
  icon: Info,
  tone: 'info',
}

interface NotificationChannelMeta {
  value: NotificationChannel
  label: string
  description: string
}

/** 渠道列顺序 —— 与服务端 `UpsertPreferenceDto` 的 channel 枚举一致 */
export const NOTIFICATION_CHANNELS: readonly NotificationChannelMeta[] = [
  { value: 'in_app', label: '站内', description: '通知中心与铃铛提醒' },
  { value: 'email', label: '邮件', description: '发送到账户邮箱' },
  { value: 'push', label: '推送', description: '移动端与浏览器推送' },
]
