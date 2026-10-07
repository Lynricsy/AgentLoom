import type { StatusTone } from '@/shared/ui/status-badge'
import type {
  SuggestionStatus,
  SuggestionType,
} from '../types/optimization-suggestion.types'

/** 建议类型的中文展示，画布内面板与全局列表共用同一份文案 */
export const SUGGESTION_TYPE_LABELS: Record<SuggestionType, string> = {
  model_downgrade: '模型降级',
  timeout_adjustment: '超时调整',
  tool_pruning: '工具精简',
  autonomy_upgrade: '自主升级',
}

export const SUGGESTION_STATUS_META: Record<
  SuggestionStatus,
  { label: string; tone: StatusTone }
> = {
  pending: { label: '待处理', tone: 'primary' },
  applied: { label: '已采纳', tone: 'success' },
  dismissed: { label: '已忽略', tone: 'neutral' },
  blocked: { label: '已阻断', tone: 'warning' },
}

export const SUGGESTION_STATUS_FILTERS: Array<{
  value: SuggestionStatus | 'all'
  label: string
}> = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待处理' },
  { value: 'applied', label: '已采纳' },
  { value: 'dismissed', label: '已忽略' },
  { value: 'blocked', label: '已阻断' },
]

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function formatSuggestionTimestamp(value?: string | null): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return dateTimeFormatter.format(date)
}
