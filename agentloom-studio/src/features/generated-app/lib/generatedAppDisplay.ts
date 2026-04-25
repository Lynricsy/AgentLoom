import type {
  GeneratedAppGateStatus,
  GeneratedAppReadiness,
  GeneratedAppReadinessState,
  GeneratedAppStatus,
} from '../types'

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
  publish_candidate: '可发布',
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
    readiness.state === 'publish_candidate' &&
    readiness.canCreatePublicShare
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
