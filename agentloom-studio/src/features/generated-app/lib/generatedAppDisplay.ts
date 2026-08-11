import type {
  GeneratedAppGateStatus,
  GeneratedAppGenerationRunStatus,
  GeneratedAppGenerationRunTrigger,
  GeneratedAppReadiness,
  GeneratedAppReadinessState,
  GeneratedAppRepairAttemptStatus,
  GeneratedAppStatus,
  GeneratedAppSubmissionStatus,
} from '../types'
import type { BadgeProps } from '@/shared/ui/badge'

/** Badge 语义色枚举，统一状态着色出口 */
type BadgeVariant = NonNullable<BadgeProps['variant']>

export const GENERATED_APP_STATUS_LABELS: Record<GeneratedAppStatus, string> = {
  app_spec_ready: '规格就绪',
  preview_ready: '预览就绪',
  trial_ready: '试用态',
  publish_candidate: '发布候选',
  published: '已发布',
  failed: '失败',
}

export const GENERATED_APP_READINESS_LABELS: Record<
  GeneratedAppReadinessState,
  string
> = {
  preview: '预览态',
  trial: '试用态',
  publish_candidate: '发布候选',
  blocked: '已阻断',
}

export const GENERATED_APP_GATE_STATUS_LABELS: Record<
  GeneratedAppGateStatus,
  string
> = {
  pending: '等待中',
  running: '运行中',
  passed: '已通过',
  failed: '失败',
  warning: 'Warning',
  skipped: '已跳过',
}

export const GENERATED_APP_SUBMISSION_STATUS_LABELS: Record<
  GeneratedAppSubmissionStatus,
  string
> = {
  received: '已接收',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
}

export const GENERATED_APP_GENERATION_RUN_STATUS_LABELS: Record<
  GeneratedAppGenerationRunStatus,
  string
> = {
  queued: '排队中',
  running: '运行中',
  repairing: '修复中',
  passed: '已通过',
  failed: '失败',
  cancelled: '已取消',
}

export const GENERATED_APP_GENERATION_RUN_TRIGGER_LABELS: Record<
  GeneratedAppGenerationRunTrigger,
  string
> = {
  initial: '首次生成',
  manual: '手动触发',
  retry: '重试',
  system: '系统触发',
}

export const GENERATED_APP_REPAIR_ATTEMPT_STATUS_LABELS: Record<
  GeneratedAppRepairAttemptStatus,
  string
> = {
  planned: '已计划',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  skipped: '已跳过',
}

export function getGeneratedAppReadinessBadgeVariant(
  readiness: GeneratedAppReadiness,
): BadgeVariant {
  switch (readiness.state) {
    case 'publish_candidate':
      return readiness.canCreatePublicShare ? 'success' : 'warning'
    case 'trial':
      return 'warning'
    case 'blocked':
      return 'error'
    default:
      return 'info'
  }
}

export function getGeneratedAppStatusBadgeVariant(
  status: GeneratedAppStatus,
): BadgeVariant {
  switch (status) {
    case 'published':
    case 'publish_candidate':
      return 'success'
    case 'failed':
      return 'error'
    case 'trial_ready':
      return 'warning'
    default:
      return 'info'
  }
}

export function getGeneratedAppGateStatusBadgeVariant(
  status: GeneratedAppGateStatus,
): BadgeVariant {
  switch (status) {
    case 'passed':
      return 'success'
    case 'failed':
      return 'error'
    case 'warning':
      return 'warning'
    case 'running':
      return 'default'
    case 'skipped':
      return 'secondary'
    default:
      return 'info'
  }
}

export function getGeneratedAppSubmissionStatusBadgeVariant(
  status: GeneratedAppSubmissionStatus,
): BadgeVariant {
  switch (status) {
    case 'completed':
      return 'success'
    case 'failed':
      return 'error'
    case 'running':
      return 'default'
    default:
      return 'info'
  }
}

export function getGeneratedAppGenerationRunStatusBadgeVariant(
  status: GeneratedAppGenerationRunStatus,
): BadgeVariant {
  switch (status) {
    case 'passed':
      return 'success'
    case 'failed':
    case 'cancelled':
      return 'error'
    case 'repairing':
      return 'warning'
    case 'running':
      return 'default'
    default:
      return 'info'
  }
}

export function getGeneratedAppRepairAttemptStatusBadgeVariant(
  status: GeneratedAppRepairAttemptStatus,
): BadgeVariant {
  switch (status) {
    case 'completed':
      return 'success'
    case 'failed':
      return 'error'
    case 'running':
      return 'default'
    case 'skipped':
      return 'secondary'
    default:
      return 'info'
  }
}

export function formatGeneratedAppDateTime(value?: string | null): string {
  if (!value) return '暂无'

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function isGeneratedAppPublicShareEligible(
  readiness: GeneratedAppReadiness,
): boolean {
  return (
    readiness.state === 'publish_candidate' && readiness.canCreatePublicShare
  )
}

export function getGeneratedAppPublicShareUnavailableReason(
  readiness: GeneratedAppReadiness,
): string {
  if (readiness.state === 'trial' || readiness.warningCount > 0) {
    return '存在非阻断 warning，当前只能作为试用预览，不能生成正式公开分享链接。'
  }

  if (readiness.state === 'blocked') {
    return '存在阻断门禁失败，必须修复并重新通过门禁后才能发布。'
  }

  return '阻断门禁未全绿，当前只能预览，不能发布公开链接。'
}
