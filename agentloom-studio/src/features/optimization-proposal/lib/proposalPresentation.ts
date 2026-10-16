import type { StatusTone } from '@/shared/ui/status-badge'
import type {
  ProposalStatus,
  ProposalSummary,
  ProposalType,
  ProposalVerdict,
} from '../api/optimizationProposalApi'

export const PROPOSAL_STATUS_META: Record<
  ProposalStatus,
  { label: string; tone: StatusTone }
> = {
  proposed: { label: '待评测', tone: 'neutral' },
  evaluating: { label: '评测中', tone: 'info' },
  evaluated: { label: '已评测', tone: 'primary' },
  published: { label: '已发布', tone: 'success' },
  rolled_back: { label: '已回滚', tone: 'warning' },
  dismissed: { label: '已忽略', tone: 'neutral' },
  superseded: { label: '已失效', tone: 'neutral' },
}

export const PROPOSAL_TYPE_LABELS: Record<ProposalType, string> = {
  team_budget_tokens: 'Token 上限',
  team_budget_messages: '消息数上限',
  team_deadline: '截止时间',
  routing_fallback_model: '路由回退模型',
}

export const VERDICT_META: Record<
  ProposalVerdict,
  { label: string; tone: StatusTone }
> = {
  improved: { label: '优于基线', tone: 'success' },
  neutral: { label: '无差异', tone: 'neutral' },
  regressed: { label: '劣于基线', tone: 'error' },
}

export const PROPOSAL_STATUS_FILTERS: Array<{
  value: ProposalStatus | 'all'
  label: string
}> = [
  { value: 'all', label: '全部' },
  { value: 'proposed', label: '待评测' },
  { value: 'evaluating', label: '评测中' },
  { value: 'evaluated', label: '已评测' },
  { value: 'published', label: '已发布' },
  { value: 'rolled_back', label: '已回滚' },
  { value: 'superseded', label: '已失效' },
  { value: 'dismissed', label: '已忽略' },
]

/** 提案值的展示：路由回退模型显示模型名，截止时间带单位，未配置显示「未配置」 */
export function formatProposalValue(
  proposal: Pick<ProposalSummary, 'proposalType' | 'evidence' | 'proposedValue'>,
  value: unknown,
): string {
  if (value === null || value === undefined) {
    return '未配置'
  }
  if (proposal.proposalType === 'routing_fallback_model') {
    return value === proposal.proposedValue && proposal.evidence.modelName
      ? proposal.evidence.modelName
      : String(value)
  }
  if (proposal.proposalType === 'team_deadline') {
    return `${String(value)} 分钟`
  }
  return typeof value === 'number' ? value.toLocaleString('zh-CN') : String(value)
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`
}

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function formatProposalTimestamp(value?: string | null): string {
  if (!value) {
    return '—'
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date)
}
