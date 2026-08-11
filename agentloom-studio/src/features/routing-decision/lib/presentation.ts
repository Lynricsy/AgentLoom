import type {
  ProviderHealthState,
  RoutingDecision,
  RoutingModelEvaluation,
} from '../types'

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'medium',
})

export function formatRoutingTimestamp(value?: string | null): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return dateTimeFormatter.format(date)
}

export function formatRoutingLatency(latencyMs: number): string {
  if (!Number.isFinite(latencyMs)) {
    return '—'
  }

  if (latencyMs >= 1_000) {
    return `${(latencyMs / 1_000).toFixed(2)} 秒`
  }

  return `${Math.round(latencyMs)} 毫秒`
}

export const PROVIDER_HEALTH_META: Record<
  ProviderHealthState,
  { label: string; variant: 'success' | 'warning' | 'error' }
> = {
  healthy: { label: '正常', variant: 'success' },
  degraded: { label: '降级', variant: 'warning' },
  open: { label: '熔断', variant: 'error' },
}

/** 已知策略名的中文展示；未收录的策略保持服务端原值，避免掩盖新增策略 */
export const ROUTING_STRATEGY_LABELS: Record<string, string> = {
  cost_optimized: '成本优先',
  latency_optimized: '延迟优先',
  quality_optimized: '质量优先',
  balanced: '均衡',
  round_robin: '轮询',
  failover: '故障转移',
}

/**
 * 解析被选中的模型展示名。
 * `selectedModelId` 可为 null（策略未选中任何模型）；有 id 但候选列表里查不到名称时退回短 id。
 */
export function resolveSelectedModelLabel(decision: RoutingDecision): {
  label: string
  selected: boolean
} {
  if (!decision.selectedModelId) {
    return { label: '未选中模型', selected: false }
  }

  const evaluations: RoutingModelEvaluation[] = decision.modelsEvaluated ?? []
  const matched = evaluations.find(
    (evaluation) => evaluation.modelId === decision.selectedModelId,
  )

  if (matched?.modelName) {
    return { label: matched.modelName, selected: true }
  }

  return { label: decision.selectedModelId.slice(0, 8), selected: true }
}
