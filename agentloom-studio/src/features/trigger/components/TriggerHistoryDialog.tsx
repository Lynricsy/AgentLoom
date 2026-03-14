import { useCallback, useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate } from '@tanstack/react-router'
import { Clock3, ExternalLink, Loader2, X } from 'lucide-react'
import { Pagination } from '@/shared/components/Pagination'
import { Button } from '@/shared/ui/button'
import { Select } from '@/shared/ui/select'
import { cn } from '@/shared/lib/utils'
import { useTriggerHistory } from '../api/triggerQueries'
import type { Trigger, TriggerHistoryRecord, TriggerHistoryStatus } from '../types'

const statusLabels: Record<TriggerHistoryStatus, string> = {
  success: '成功',
  failed: '失败',
  skipped: '跳过',
}

const statusBadgeClassNames: Record<TriggerHistoryStatus, string> = {
  success: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
  failed: 'border-rose-400/30 bg-rose-500/10 text-rose-200',
  skipped: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
}

interface TriggerHistoryDialogProps {
  workflowId: string
  trigger: Trigger | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatTriggeredAt(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-surface p-6 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-3 top-3 h-8 w-8 p-0"
              aria-label="关闭触发历史对话框"
            >
              <X className="h-4 w-4" />
            </Button>
          </Dialog.Close>

          <Dialog.Title className="text-base font-semibold text-foreground">
            触发历史记录
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            {trigger ? `查看「${trigger.name}」最近的执行与投递结果。` : '查看触发器执行记录。'}
          </Dialog.Description>

          <div className="mt-5 flex flex-col gap-3 rounded-xl border border-border/70 bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                筛选条件
              </p>
              <p className="text-sm text-foreground">
                {meta ? `共 ${meta.total} 条记录` : '按状态查看最近触发结果'}
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
                <option value="all">全部状态</option>
                <option value="success">成功</option>
                <option value="failed">失败</option>
                <option value="skipped">跳过</option>
              </Select>
            </div>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
            {historyQuery.isLoading ? (
              <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-border/70 bg-background/30">
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在加载触发历史...
                </div>
              </div>
            ) : historyQuery.isError ? (
              <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/10 px-6 text-center">
                <p className="text-sm text-rose-200">
                  无法加载触发历史，请稍后重试。
                </p>
              </div>
            ) : records.length === 0 ? (
              <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/30 px-6 text-center">
                <div>
                  <p className="text-base font-medium text-foreground">暂无历史记录</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    当前筛选条件下还没有触发结果。
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {records.map((record) => (
                  <article
                    key={record.id}
                    className="rounded-xl border border-border/70 bg-background/60 p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em]',
                              statusBadgeClassNames[record.status],
                            )}
                          >
                            {statusLabels[record.status]}
                          </span>
                          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock3 className="h-3.5 w-3.5" />
                            {formatTriggeredAt(record.triggeredAt)}
                          </span>
                        </div>

                        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                          <div>
                            <span className="font-medium text-foreground">记录 ID：</span>{' '}
                            <code className="text-xs text-foreground/90">{record.id}</code>
                          </div>
                          <div>
                            <span className="font-medium text-foreground">执行 ID：</span>{' '}
                            {record.executionId ? (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-primary transition hover:text-primary/80"
                                onClick={() => handleViewExecution(record)}
                              >
                                <code className="text-xs">{record.executionId}</code>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              '—'
                            )}
                          </div>
                        </div>

                        {record.errorMessage ? (
                          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-100">
                            {record.errorMessage}
                          </div>
                        ) : null}
                      </div>

                      {record.executionId ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 gap-1.5"
                          onClick={() => handleViewExecution(record)}
                        >
                          查看执行
                          <ExternalLink className="h-3.5 w-3.5" />
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
