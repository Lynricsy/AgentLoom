import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Clock3, ExternalLink, History, TriangleAlert } from 'lucide-react'
import { Pagination } from '@/shared/components/Pagination'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { formatDateTime, formatNumber } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { cn } from '@/shared/lib/utils'
import { Skeleton } from '@/shared/ui/skeleton'
import { StatusBadge } from '@/shared/ui/status-badge'
import { useTriggerHistory } from '../api/triggerQueries'
import { TRIGGER_HISTORY_STATUS_META } from '../lib/triggerMeta'
import type { Trigger, TriggerHistoryRecord, TriggerHistoryStatus } from '../types'

const STATUS_FILTER_OPTIONS = Object.entries(TRIGGER_HISTORY_STATUS_META) as Array<
  [TriggerHistoryStatus, (typeof TRIGGER_HISTORY_STATUS_META)[TriggerHistoryStatus]]
>

interface TriggerHistoryDialogProps {
  workflowId: string
  trigger: Trigger | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TriggerHistoryDialog({
  workflowId,
  trigger,
  open,
  onOpenChange,
}: TriggerHistoryDialogProps) {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<'all' | TriggerHistoryStatus>('all')

  useEffect(() => {
    const triggerId = trigger?.id

    if (!open) {
      setPage(1)
      setStatus('all')
      return
    }

    if (!triggerId) {
      return
    }

    setPage(1)
  }, [open, trigger?.id])

  const queryParams = useMemo(
    () => ({
      page,
      pageSize: 20,
      status: status === 'all' ? undefined : status,
    }),
    [page, status],
  )

  const historyQuery = useTriggerHistory(workflowId, trigger?.id, queryParams)

  const handleViewExecution = useCallback(
    (record: TriggerHistoryRecord) => {
      if (!record.executionId) {
        return
      }

      void navigate({
        to: '/executions/$executionId',
        params: { executionId: record.executionId },
      })
    },
    [navigate],
  )

  const records = historyQuery.data?.data ?? []
  const meta = historyQuery.data?.meta
  const totalPages = meta?.totalPages ?? 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>触发历史记录</DialogTitle>
          <DialogDescription>
            {trigger ? `查看「${trigger.name}」最近的执行与投递结果。` : '查看触发器执行记录。'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-col">
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground">
                筛选条件
              </p>
              <p className="text-sm text-foreground tabular-nums">
                {meta ? `共 ${formatNumber(meta.total)} 条记录` : '按状态查看最近触发结果'}
              </p>
            </div>

            <div className="w-full sm:w-48">
              <Select
                value={status}
                onValueChange={(value) => {
                  setPage(1)
                  setStatus(value as 'all' | TriggerHistoryStatus)
                }}
              >
                <SelectTrigger aria-label="触发状态筛选">
                  <SelectValue placeholder="全部状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  {STATUS_FILTER_OPTIONS.map(([value, statusMeta]) => (
                    <SelectItem key={value} value={value}>
                      {statusMeta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
            {historyQuery.isLoading ? (
              <div className="space-y-3" data-testid="trigger-history-loading">
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton key={index} className="h-[7.5rem] w-full rounded-lg" />
                ))}
              </div>
            ) : historyQuery.isError ? (
              <EmptyState
                icon={TriangleAlert}
                tone="var(--color-error)"
                title="无法加载触发历史"
                description="请稍后重试。"
              />
            ) : records.length === 0 ? (
              <EmptyState
                icon={History}
                title="暂无历史记录"
                description="当前筛选条件下还没有触发结果。"
              />
            ) : (
              <div
                className={cn(
                  'space-y-3 transition-opacity duration-150',
                  historyQuery.isFetching && 'opacity-60',
                )}
              >
                {records.map((record) => (
                  <article
                    key={record.id}
                    className="rounded-lg border border-border bg-surface p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge
                            tone={TRIGGER_HISTORY_STATUS_META[record.status].tone}
                            size="sm"
                          >
                            {TRIGGER_HISTORY_STATUS_META[record.status].label}
                          </StatusBadge>
                          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                            <Clock3 className="size-3.5 shrink-0" />
                            {formatDateTime(record.triggeredAt)}
                          </span>
                        </div>

                        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                          <div className="min-w-0">
                            <span className="font-medium text-foreground">记录 ID：</span>{' '}
                            <code className="break-all text-xs text-foreground/90">{record.id}</code>
                          </div>
                          <div className="min-w-0">
                            <span className="font-medium text-foreground">执行 ID：</span>{' '}
                            {record.executionId ? (
                              <Button
                                variant="link"
                                className="h-auto max-w-full gap-1 whitespace-normal break-all p-0 text-left font-normal hover:text-primary/80"
                                onClick={() => handleViewExecution(record)}
                              >
                                <code className="min-w-0 text-xs">{record.executionId}</code>
                                <ExternalLink className="shrink-0" />
                              </Button>
                            ) : (
                              '—'
                            )}
                          </div>
                        </div>

                        {record.errorMessage ? (
                          <div className="whitespace-pre-wrap break-words rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
                            {record.errorMessage}
                          </div>
                        ) : null}
                      </div>

                      {record.executionId ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() => handleViewExecution(record)}
                        >
                          查看执行
                          <ExternalLink />
                        </Button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          {records.length > 0 ? (
            <div className="mt-4">
              <Pagination
                page={meta?.page ?? page}
                totalPages={Math.max(totalPages, 1)}
                onPageChange={setPage}
                isLoading={historyQuery.isFetching}
              />
            </div>
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
