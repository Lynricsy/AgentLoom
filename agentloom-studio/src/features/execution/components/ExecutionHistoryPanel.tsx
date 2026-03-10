import { memo, useState } from 'react'
import { AlertCircle, History, Loader2, X } from 'lucide-react'
import { Pagination } from '@/shared/components'
import { Button } from '@/shared/ui/button'
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
        'flex h-full min-h-[320px] w-full flex-col overflow-hidden rounded-3xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur-md',
        className,
      )}
      data-testid="execution-history-panel"
    >
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">执行记录</h2>
            <p className="text-xs text-muted-foreground">浏览工作流最近运行历史</p>
          </div>
        </div>
        {onClose ? (
          <Button variant="ghost" size="sm" className="h-8 w-8 px-0" onClick={onClose} aria-label="关闭执行记录">
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 text-muted-foreground" data-testid="execution-history-loading">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">正在加载执行记录...</p>
          </div>
        ) : error ? (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 text-center" data-testid="execution-history-error">
            <AlertCircle className="h-8 w-8 text-rose-400" />
            <div>
              <p className="text-sm font-medium text-foreground">加载执行记录失败</p>
              <p className="text-xs text-muted-foreground">{error.message}</p>
            </div>
          </div>
        ) : executions.length === 0 ? (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 text-center text-muted-foreground" data-testid="execution-history-empty">
            <History className="h-8 w-8 opacity-50" />
            <p className="text-sm font-medium text-foreground">还没有执行记录</p>
            <p className="max-w-xs text-xs">点击 Run 按钮后，这里会出现完整的执行历史与调试入口。</p>
          </div>
        ) : (
          <div className="space-y-3" data-testid="execution-history-list">
            {executions.map((execution) => (
              <RunCard key={execution.id} execution={execution} />
            ))}
          </div>
        )}
      </div>

      {executions.length > 0 ? (
        <div className="border-t border-border/60 px-4 py-3">
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
