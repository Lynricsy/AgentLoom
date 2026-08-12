import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Lightbulb } from 'lucide-react'
import { SUGGESTION_PAGE_SIZE } from '../api/optimization-suggestion-api'
import {
  useAdoptionStats,
  useDismissSuggestion,
  useSuggestionList,
} from '../api/optimization-suggestion-queries'
import {
  SUGGESTION_STATUS_FILTERS,
  SUGGESTION_STATUS_META,
  SUGGESTION_TYPE_LABELS,
  formatSuggestionTimestamp,
} from '../lib/suggestionPresentation'
import type {
  OptimizationSuggestion,
  SuggestionStatus,
} from '../types/optimization-suggestion.types'
import {
  DataTable,
  type DataTableColumn,
} from '@/shared/components/data-table/DataTable'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Progress } from '@/shared/ui/progress'
import { Skeleton } from '@/shared/ui/skeleton'
import { useToast } from '@/shared/ui/toast'

type StatusFilter = SuggestionStatus | 'all'

function AdoptionStatsCard() {
  const { data: stats, isLoading, isError, error } = useAdoptionStats()

  if (isLoading) {
    return (
      <Card data-testid="suggestion-stats-loading">
        <CardContent className="space-y-3 p-4">
          <Skeleton className="h-4 w-24 rounded-full" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-3 w-48 rounded-full" />
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card className="border-error/30" data-testid="suggestion-stats-error">
        <CardContent className="space-y-1 p-4">
          <p className="text-sm font-medium text-foreground">加载采纳率失败</p>
          <p className="text-xs font-medium text-error">
            {error instanceof Error ? error.message : '未知错误'}
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!stats || stats.total === 0) {
    return (
      <Card data-testid="suggestion-stats-empty">
        <CardContent className="p-4">
          <p className="text-xs text-muted">
            当前组织还没有生成过优化建议，采纳率会在建议产生后开始统计。
          </p>
        </CardContent>
      </Card>
    )
  }

  const adoptionPct = Math.round(stats.adoptionRate * 100)
  const targetPct = Math.round(stats.targetRate * 100)
  const meetsTarget = stats.adoptionRate >= stats.targetRate

  return (
    <Card data-testid="suggestion-stats-card">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-foreground">采纳率</span>
            <span
              className="text-2xl font-semibold tabular-nums text-foreground"
              data-testid="suggestion-adoption-rate"
            >
              {adoptionPct}%
            </span>
          </div>
          <Badge variant={meetsTarget ? 'success' : 'warning'}>
            {meetsTarget ? '已达目标' : '低于目标'} · 目标 {targetPct}%
          </Badge>
        </div>

        <Progress
          value={adoptionPct}
          tone={
            meetsTarget ? 'var(--color-success)' : 'var(--color-warning)'
          }
          aria-label="优化建议采纳率"
        />

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-5">
          {(
            [
              ['总计', stats.total],
              ['已采纳', stats.applied],
              ['待处理', stats.pending],
              ['已忽略', stats.dismissed],
              ['已阻断', stats.blocked],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-1.5">
              <dt>{label}</dt>
              <dd className="font-medium tabular-nums text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

/**
 * 全局优化建议列表。
 *
 * 只提供「忽略」与跳转画布的深链。四类建议当前都不可采纳（判据见
 * `OptimizationSuggestionsPanel` 的 `APPLICABLE_SUGGESTION_TYPES`），
 * 深链的用途是到画布上查看该建议所属节点的上下文。
 */
export const OptimizationSuggestionsBoard = memo(
  function OptimizationSuggestionsBoard() {
    const { notify } = useToast()
    const [status, setStatus] = useState<StatusFilter>('all')
    const [page, setPage] = useState(1)
    const offset = (page - 1) * SUGGESTION_PAGE_SIZE

    const { data, isLoading, isError, error } = useSuggestionList({
      limit: SUGGESTION_PAGE_SIZE,
      offset,
      status: status === 'all' ? undefined : status,
    })
    const dismissMutation = useDismissSuggestion()
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
        title: '加载优化建议失败',
        description: message,
      })
    }, [error, isError, notify])

    const handleDismiss = useCallback(
      (suggestionId: string) => {
        dismissMutation.mutate(suggestionId, {
          onSuccess: () => {
            notify({
              variant: 'success',
              title: '已忽略该建议',
              description: '该建议不会再出现在待处理列表中。',
            })
          },
          onError: (mutationError) => {
            notify({
              variant: 'error',
              title: '忽略建议失败',
              description: mutationError.message || '未知错误',
            })
          },
        })
      },
      [dismissMutation, notify],
    )

    const columns = useMemo<DataTableColumn<OptimizationSuggestion>[]>(
      () => [
        {
          key: 'suggestion',
          header: '建议',
          className: 'w-full max-w-0',
          cell: (suggestion) => (
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-medium text-foreground">
                {SUGGESTION_TYPE_LABELS[suggestion.suggestionType]}
              </p>
              <p className="line-clamp-2 text-xs text-muted" title={suggestion.rationale}>
                {suggestion.rationale}
              </p>
            </div>
          ),
        },
        {
          key: 'status',
          header: '状态',
          className: 'whitespace-nowrap',
          cell: (suggestion) => {
            const meta = SUGGESTION_STATUS_META[suggestion.status]

            return <Badge variant={meta.variant}>{meta.label}</Badge>
          },
        },
        {
          key: 'confidence',
          header: '置信度',
          className: 'whitespace-nowrap text-right',
          cell: (suggestion) => (
            <span className="text-xs tabular-nums text-foreground">
              {Math.round(suggestion.confidence * 100)}%
            </span>
          ),
        },
        {
          key: 'nodeId',
          header: '节点',
          hideBelow: 'md',
          cell: (suggestion) => (
            <span className="text-xs text-muted">{suggestion.nodeId}</span>
          ),
        },
        {
          key: 'createdAt',
          header: '生成时间',
          hideBelow: 'lg',
          className: 'whitespace-nowrap',
          cell: (suggestion) => (
            <span className="text-xs text-muted">
              {formatSuggestionTimestamp(suggestion.createdAt)}
            </span>
          ),
        },
        {
          key: 'actions',
          header: '操作',
          className: 'whitespace-nowrap text-right',
          cell: (suggestion) => (
            <div className="flex items-center justify-end gap-2">
              {suggestion.status === 'pending' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={dismissMutation.isPending}
                  onClick={() => handleDismiss(suggestion.id)}
                  data-testid={`suggestion-dismiss-${suggestion.id}`}
                >
                  忽略
                </Button>
              ) : null}
              <a
                href={`/workflows/${suggestion.workflowDefinitionId}`}
                className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-primary transition-colors hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                data-testid={`suggestion-canvas-link-${suggestion.id}`}
              >
                在画布中查看
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          ),
        },
      ],
      [dismissMutation.isPending, handleDismiss],
    )

    const suggestions = data?.data ?? []
    const total = data?.meta.total ?? 0

    return (
      <div className="space-y-4" data-testid="optimization-suggestions-board">
        <AdoptionStatsCard />

        <div
          role="group"
          aria-label="建议状态筛选"
          className="flex flex-wrap gap-1.5"
        >
          {SUGGESTION_STATUS_FILTERS.map((option) => {
            const isActive = option.value === status

            return (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={isActive ? 'default' : 'outline'}
                aria-pressed={isActive}
                data-testid={`suggestion-filter-${option.value}`}
                onClick={() => {
                  setStatus(option.value)
                  setPage(1)
                }}
              >
                {option.label}
              </Button>
            )
          })}
        </div>

        <p className="text-xs leading-relaxed text-muted">
          workflow agent 节点的模型、工具、超时与自治级别由所绑定的 Agent Definition
          决定，节点上的这些字段不参与执行，因此这些建议当前无法采纳；如需调整请到对应的
          Agent Definition 中修改。建议可以忽略，也可以在画布中查看所属节点的上下文。
        </p>

        {isError ? (
          <Card className="border-error/30" data-testid="optimization-suggestions-error">
            <CardContent className="space-y-1 p-5">
              <p className="text-sm font-medium text-foreground">加载优化建议失败</p>
              <p className="text-xs font-medium text-error">
                {error instanceof Error ? error.message : '未知错误'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <DataTable
            columns={columns}
            data={suggestions}
            loading={isLoading}
            rowKey={(suggestion) => suggestion.id}
            empty={
              <div data-testid="optimization-suggestions-empty">
                <EmptyState
                  icon={Lightbulb}
                  title="暂无优化建议"
                  description="系统会在积累足够的执行样本后，针对模型选型、超时、工具集与自主等级生成优化建议。"
                />
              </div>
            }
            pagination={{
              page,
              pageSize: SUGGESTION_PAGE_SIZE,
              total,
              onPageChange: setPage,
            }}
          />
        )}
      </div>
    )
  },
)
