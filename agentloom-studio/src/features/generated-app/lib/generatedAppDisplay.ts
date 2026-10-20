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
import { formatDateTime } from '@/shared/lib/format'
import type { StatusTone } from '@/shared/ui/status-badge'

export interface GeneratedAppStatusMeta {
  label: string
  tone: StatusTone
}

export const GENERATED_APP_STATUS_META: Record<
  GeneratedAppStatus,
  GeneratedAppStatusMeta
> = {
  app_spec_generating: { label: '规格生成中', tone: 'info' },
  app_spec_ready: { label: '规格就绪', tone: 'info' },
  preview_ready: { label: '预览就绪', tone: 'info' },
  trial_ready: { label: '试用态', tone: 'warning' },
  publish_candidate: { label: '发布候选', tone: 'success' },
  published: { label: '已发布', tone: 'success' },
  failed: { label: '失败', tone: 'error' },
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

export const GENERATED_APP_GATE_STATUS_META: Record<
  GeneratedAppGateStatus,
  GeneratedAppStatusMeta
> = {
  pending: { label: '等待中', tone: 'info' },
  running: { label: '运行中', tone: 'primary' },
  passed: { label: '已通过', tone: 'success' },
  failed: { label: '失败', tone: 'error' },
  warning: { label: 'Warning', tone: 'warning' },
  skipped: { label: '已跳过', tone: 'neutral' },
}

export const GENERATED_APP_SUBMISSION_STATUS_META: Record<
  GeneratedAppSubmissionStatus,
  GeneratedAppStatusMeta
> = {
  received: { label: '已接收', tone: 'info' },
  running: { label: '运行中', tone: 'primary' },
  completed: { label: '已完成', tone: 'success' },
  failed: { label: '失败', tone: 'error' },
}

export const GENERATED_APP_GENERATION_RUN_STATUS_META: Record<
  GeneratedAppGenerationRunStatus,
  GeneratedAppStatusMeta
> = {
  queued: { label: '排队中', tone: 'info' },
  running: { label: '运行中', tone: 'primary' },
  repairing: { label: '修复中', tone: 'warning' },
  passed: { label: '已通过', tone: 'success' },
  failed: { label: '失败', tone: 'error' },
  cancelled: { label: '已取消', tone: 'error' },
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

export const GENERATED_APP_REPAIR_ATTEMPT_STATUS_META: Record<
  GeneratedAppRepairAttemptStatus,
  GeneratedAppStatusMeta
> = {
  planned: { label: '已计划', tone: 'info' },
  running: { label: '运行中', tone: 'primary' },
  completed: { label: '已完成', tone: 'success' },
  failed: { label: '失败', tone: 'error' },
  skipped: { label: '已跳过', tone: 'neutral' },
}

export function getGeneratedAppReadinessStatusTone(
  readiness: GeneratedAppReadiness,
): StatusTone {
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

export function formatGeneratedAppDateTime(value?: string | null): string {
  if (!value) return '暂无'

  return formatDateTime(value)
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
