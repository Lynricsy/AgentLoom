import { memo, useState } from 'react'
import { motion } from 'motion/react'
import { History, TriangleAlert, X } from 'lucide-react'
import { Pagination } from '@/shared/components'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'
import { staggerList } from '@/shared/lib/motion'
import { useExecutionList } from '../hooks/useExecutionList'
import { RunCard } from './RunCard'
import { cn } from '@/shared/lib/utils'

interface ExecutionHistoryPanelProps {
  workflowDefinitionId: string
  className?: string
  onClose?: () => void
}

export const ExecutionHistoryPanel = memo(function ExecutionHistoryPanel({
  workflowDefinitionId,
  className,
  onClose,
}: ExecutionHistoryPanelProps) {
  const [page, setPage] = useState(1)
  const pageSize = 6
  const { data, isLoading, isFetching, error } = useExecutionList(workflowDefinitionId, {
    page,
    pageSize,
  })

  const executions = data?.data ?? []
  const meta = data?.meta
  const totalPages = Math.max(meta?.totalPages ?? 1, 1)

  return (
    <aside
      className={cn(
        'flex h-full min-h-[320px] w-full flex-col overflow-hidden rounded-panel border border-border bg-surface shadow-panel',
        className,
      )}
      data-testid="execution-history-panel"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <History className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">执行记录</h2>
            <p className="truncate text-xs text-muted">浏览工作流最近运行历史</p>
          </div>
        </div>
        {onClose ? (
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="关闭执行记录">
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="space-y-3" data-testid="execution-history-loading">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-28 w-full rounded-card" />
            ))}
          </div>
        ) : error ? (
          <div
            className="flex h-full min-h-[220px] items-center justify-center"
            data-testid="execution-history-error"
          >
            <EmptyState
              className="border-0 px-0 py-0"
              icon={TriangleAlert}
              tone="var(--color-error)"
              title="加载执行记录失败"
              description={error.message}
            />
          </div>
        ) : executions.length === 0 ? (
          <div
            className="flex h-full min-h-[220px] items-center justify-center"
            data-testid="execution-history-empty"
          >
            <EmptyState
              className="border-0 px-0 py-0"
              icon={History}
              title="还没有执行记录"
              description="点击 Run 按钮后，这里会出现完整的执行历史与调试入口。"
            />
          </div>
        ) : (
          <div className="space-y-3" data-testid="execution-history-list">
            {executions.map((execution, index) => (
              <motion.div key={execution.id} {...staggerList(index)}>
                <RunCard execution={execution} />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {executions.length > 0 ? (
        <div className="border-t border-border px-4 py-3">
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            isLoading={isFetching}
          />
        </div>
      ) : null}
    </aside>
  )
})
