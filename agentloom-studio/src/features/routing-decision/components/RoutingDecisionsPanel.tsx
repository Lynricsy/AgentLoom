import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Route } from 'lucide-react'
import { ProviderHealthBar } from './ProviderHealthBar'
import { ROUTING_DECISION_PAGE_SIZE } from '../api/routing-decision-api'
import { useRoutingDecisions } from '../api/routing-decision-queries'
import {
  ROUTING_STRATEGY_LABELS,
  formatRoutingLatency,
  formatRoutingTimestamp,
  resolveSelectedModelLabel,
} from '../lib/presentation'
import type { RoutingDecision } from '../types'
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
    className: 'whitespace-nowrap',
    cell: (decision) => (
      <span className="text-xs text-muted">
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
          <span className="text-[10px] text-muted">{decision.routerType}</span>
        ) : null}
      </div>
    ),
  },
  {
    key: 'selectedModel',
    header: '选中模型',
    cell: (decision) => {
      const { label, selected } = resolveSelectedModelLabel(decision)

      if (!selected) {
        return (
          <Badge variant="secondary" data-testid="routing-decision-model-unselected">
            {label}
          </Badge>
        )
      }

      return (
        <span className="text-xs font-medium text-foreground">{label}</span>
      )
    },
  },
  {
    key: 'latency',
    header: '延迟',
    className: 'whitespace-nowrap text-right',
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
        className="block max-w-[12rem] truncate text-xs text-muted"
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
      <span className="line-clamp-2 text-xs text-muted" title={decision.decisionReasoning}>
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
          <CardContent className="space-y-1 p-5">
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
