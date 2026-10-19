import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Route } from 'lucide-react'
import { ProviderHealthBar } from './ProviderHealthBar'
import { ROUTING_DECISION_PAGE_SIZE } from '../api/routing-decision-api'
import { useRoutingDecisions } from '../api/routing-decision-queries'
import {
  ROUTING_FALLBACK_REASON_LABELS,
  ROUTING_FALLBACK_SOURCE_LABELS,
  ROUTING_STRATEGY_LABELS,
  formatRoutingLatency,
  formatRoutingTimestamp,
  resolveSelectedModelLabel,
} from '../lib/presentation'
import type { RoutingDecision } from '../types'
import { JevShadowBadge } from '@/features/decision-record'
import {
  DataTable,
  type DataTableColumn,
} from '@/shared/components/data-table/DataTable'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { Badge } from '@/shared/ui/badge'
import { Card, CardContent } from '@/shared/ui/card'
import { useToast } from '@/shared/ui/toast'

const COLUMNS: DataTableColumn<RoutingDecision>[] = [
  {
    key: 'createdAt',
    header: '时间',
    nowrap: true,
    cell: (decision) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatRoutingTimestamp(decision.createdAt)}
      </span>
    ),
  },
  {
    key: 'strategy',
    header: '策略',
    cell: (decision) => (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-foreground">
          {ROUTING_STRATEGY_LABELS[decision.strategy] ?? decision.strategy}
        </span>
        {decision.routerType ? (
          <span className="text-2xs text-muted-foreground">{decision.routerType}</span>
        ) : null}
        {decision.fallbackReason ? (
          <Badge
            variant="warning"
            size="sm"
            className="self-start"
            data-testid="routing-decision-fallback"
            title={
              decision.fallbackSource
                ? `回退来源：${ROUTING_FALLBACK_SOURCE_LABELS[decision.fallbackSource] ?? decision.fallbackSource}`
                : undefined
            }
          >
            回退：{ROUTING_FALLBACK_REASON_LABELS[decision.fallbackReason] ?? decision.fallbackReason}
          </Badge>
        ) : null}
      </div>
    ),
  },
  {
    key: 'selectedModel',
    header: '选中模型',
    cell: (decision) => {
      const { label, selected } = resolveSelectedModelLabel(decision)

      // 选中/未选中统一同一种单行文本形态，行高与基线一致；长模型 ID 截断并保留 title
      return (
        <div className="flex flex-col gap-0.5">
          <span
            className={
              selected
                ? 'block max-w-56 truncate text-xs font-medium text-foreground'
                : 'block max-w-56 truncate text-xs text-muted-foreground'
            }
            title={label}
            data-testid={selected ? undefined : 'routing-decision-model-unselected'}
          >
            {label}
          </span>
          {/* 工作流路由节点、工作流 Agent 节点与对话的路由决策都经 DecisionService 记录，可能有 Jev 影子 */}
          <JevShadowBadge
            subjectType="routing_decision"
            subjectId={decision.id}
            choiceLabels={Object.fromEntries(
              decision.modelsEvaluated.map((model) => [model.modelId, model.modelName]),
            )}
            className="self-start"
          />
        </div>
      )
    },
  },
  {
    key: 'latency',
    header: '延迟',
    align: 'right',
    nowrap: true,
    cell: (decision) => (
      <span className="text-xs tabular-nums text-foreground">
        {formatRoutingLatency(decision.routingLatencyMs)}
      </span>
    ),
  },
  {
    key: 'routingNodeId',
    header: '路由节点',
    hideBelow: 'lg',
    cell: (decision) => (
      <span
        className="block max-w-[12rem] truncate text-xs text-muted-foreground"
        title={decision.routingNodeId}
      >
        {decision.routingNodeId}
      </span>
    ),
  },
  {
    key: 'reasoning',
    header: '决策说明',
    hideBelow: 'lg',
    className: 'w-full max-w-0',
    cell: (decision) => (
      <span className="line-clamp-2 text-xs text-muted-foreground" title={decision.decisionReasoning}>
        {decision.decisionReasoning || '—'}
      </span>
    ),
  },
]

/** 全局路由决策观测：健康条 + 决策分页表，只读，不提供重放/回滚 */
export const RoutingDecisionsPanel = memo(function RoutingDecisionsPanel() {
  const { notify } = useToast()
  const [page, setPage] = useState(1)
  const query = useMemo(
    () => ({ page, pageSize: ROUTING_DECISION_PAGE_SIZE }),
    [page],
  )
  const { data, isLoading, isError, error } = useRoutingDecisions(query)
  const notifiedErrorRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isError) {
      notifiedErrorRef.current = null
      return
    }

    const message = error instanceof Error ? error.message : '未知错误'
    if (notifiedErrorRef.current === message) {
      return
    }

    notifiedErrorRef.current = message
    notify({
      variant: 'error',
      title: '加载路由决策失败',
      description: message,
    })
  }, [error, isError, notify])

  const decisions = data?.data ?? []
  const total = data?.meta.total ?? 0

  return (
    <div className="space-y-4" data-testid="routing-decisions-panel">
      <ProviderHealthBar />

      {isError ? (
        <Card className="border-error/30" data-testid="routing-decisions-error">
          <CardContent className="space-y-1 p-4">
            <p className="text-sm font-medium text-foreground">加载路由决策失败</p>
            <p className="text-xs font-medium text-error">
              {error instanceof Error ? error.message : '未知错误'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <DataTable
          columns={COLUMNS}
          data={decisions}
          loading={isLoading}
          rowKey={(decision) => decision.id}
          empty={
            <div data-testid="routing-decisions-empty">
              <EmptyState
                variant="plain"
                icon={Route}
                title="暂无路由决策记录"
                description="当工作流中的路由节点实际执行并完成模型选型后，这里会记录每次决策的策略、候选模型与耗时。"
              />
            </div>
          }
          pagination={{
            page,
            pageSize: ROUTING_DECISION_PAGE_SIZE,
            total,
            onPageChange: setPage,
          }}
        />
      )}
    </div>
  )
})
