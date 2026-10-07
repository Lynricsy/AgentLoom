import { useCallback, useState } from 'react'

import { Pagination } from '@/shared/components/Pagination'
import { Spinner } from '@/shared/components/spinner/Spinner'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { StatusBadge, type StatusTone } from '@/shared/ui/status-badge'
import { useToast } from '@/shared/ui/toast'
import type { PaginatedResponse } from '@/shared/types/api'
import { useUpdatePayoutStatus } from '../api/developer-earnings.queries'
import {
  PAYOUT_STATUS_TRANSITIONS,
  type PayoutStatus,
  type SettlementRecord,
} from '../api/developer-earnings.api'
import { resolveDeveloperConsoleErrorMessage } from '../lib/developerKey'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const numberFormatter = new Intl.NumberFormat('en-US')

const STATUS_CONFIG = {
  pending: { label: '待处理', tone: 'warning' },
  processing: { label: '处理中', tone: 'info' },
  completed: { label: '已完成', tone: 'success' },
  failed: { label: '失败', tone: 'error' },
} as const satisfies Record<PayoutStatus, { label: string; tone: StatusTone }>

/** 迁移动作文案按「当前状态 → 目标状态」取，避免把 failed→processing 也叫「标记处理中」 */
const TRANSITION_LABEL: Record<PayoutStatus, Partial<Record<PayoutStatus, string>>> =
  {
    pending: { processing: '标记处理中' },
    processing: { completed: '标记完成', failed: '标记失败' },
    failed: { processing: '重试处理' },
    completed: {},
  }

function formatPeriod(start: string, end: string): string {
  return `${start.slice(0, 10)} ~ ${end.slice(0, 10)}`
}

interface SettlementHistoryProps {
  settlements: PaginatedResponse<SettlementRecord> | undefined
  isLoading: boolean
  page: number
  onPageChange: (page: number) => void
  /** owner/admin 才能推进打款状态；其余角色只读 */
  canManagePayouts?: boolean
}

const SKELETON_ROW_KEYS = ['skel-stl-1', 'skel-stl-2', 'skel-stl-3', 'skel-stl-4', 'skel-stl-5']
const SKELETON_COL_KEYS = ['col-1', 'col-2', 'col-3', 'col-4', 'col-5', 'col-6']

function SkeletonRows() {
  return (
    <>
      {SKELETON_ROW_KEYS.map((rowKey) => (
        <tr key={rowKey}>
          {SKELETON_COL_KEYS.map((colKey) => (
            <td key={colKey} className="px-4 py-3">
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

/** 迁移到 completed 时需要一个打款凭证，用对话框收集 */
interface PendingCompletion {
  record: SettlementRecord
}

export function SettlementHistory({
  settlements,
  isLoading,
  page,
  onPageChange,
  canManagePayouts = false,
}: SettlementHistoryProps) {
  const records = settlements?.data
  const totalPages = settlements?.meta.totalPages ?? 1
  const columnCount = canManagePayouts ? 7 : 6

  const { notify } = useToast()
  const payoutMutation = useUpdatePayoutStatus()
  const [pendingCompletion, setPendingCompletion] =
    useState<PendingCompletion | null>(null)
  const [payoutReference, setPayoutReference] = useState('')
  const [advancingId, setAdvancingId] = useState<string | null>(null)

  const advance = useCallback(
    async (
      record: SettlementRecord,
      next: PayoutStatus,
      reference?: string,
    ) => {
      setAdvancingId(record.id)

      try {
        await payoutMutation.mutateAsync({
          earningId: record.id,
          body: reference
            ? { payoutStatus: next, payoutReference: reference }
            : { payoutStatus: next },
        })
        notify({
          title: '打款状态已更新',
          description: `「${record.pluginName}」的结算记录现在是${STATUS_CONFIG[next].label}。`,
          variant: 'success',
        })
        setPendingCompletion(null)
        setPayoutReference('')
      } catch (error) {
        notify({
          title: '打款状态更新失败',
          description: await resolveDeveloperConsoleErrorMessage(
            error,
            '该状态迁移不被允许，请刷新后重试。',
          ),
          variant: 'error',
        })
      } finally {
        setAdvancingId(null)
      }
    },
    [notify, payoutMutation],
  )

  return (
    <Card>
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-base font-semibold text-foreground">结算历史</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">期间</th>
              <th className="px-4 py-3 font-medium">插件名</th>
              <th className="px-4 py-3 font-medium">使用量</th>
              <th className="px-4 py-3 font-medium">总收入</th>
              <th className="px-4 py-3 font-medium">开发者份额</th>
              <th className="px-4 py-3 font-medium">状态</th>
              {canManagePayouts ? (
                <th className="px-4 py-3 text-right font-medium">打款操作</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <SkeletonRows />
            ) : !records || records.length === 0 ? (
              <tr>
                <td
                  colSpan={columnCount}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  暂无结算记录
                </td>
              </tr>
            ) : (
              records.map((record) => {
                const statusConfig = STATUS_CONFIG[record.payoutStatus]
                const transitions =
                  PAYOUT_STATUS_TRANSITIONS[record.payoutStatus]

                return (
                  <tr
                    key={record.id}
                    className="border-b border-border/50 last:border-b-0"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatPeriod(record.periodStart, record.periodEnd)}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {record.pluginName}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {numberFormatter.format(record.totalExecutions)}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {currencyFormatter.format(
                        parseFloat(record.totalRevenue),
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {currencyFormatter.format(
                        parseFloat(record.developerShare),
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={statusConfig.tone}>
                        {statusConfig.label}
                      </StatusBadge>
                    </td>
                    {canManagePayouts ? (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          {transitions.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              终态
                            </span>
                          ) : (
                            transitions.map((next) => (
                              <Button
                                key={next}
                                variant="outline"
                                size="sm"
                                disabled={advancingId === record.id}
                                onClick={() => {
                                  if (next === 'completed') {
                                    setPayoutReference('')
                                    setPendingCompletion({ record })
                                    return
                                  }

                                  void advance(record, next)
                                }}
                              >
                                {advancingId === record.id ? (
                                  <Spinner size="sm" />
                                ) : null}
                                {TRANSITION_LABEL[record.payoutStatus][next]}
                              </Button>
                            ))
                          )}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {settlements && totalPages > 1 && (
        <div className="border-t border-border p-3">
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
            isLoading={isLoading}
          />
        </div>
      )}

      <Dialog
        open={pendingCompletion !== null}
        onOpenChange={(open) => {
          if (!open) setPendingCompletion(null)
        }}
      >
        <DialogContent size="sm" data-testid="payout-complete-dialog">
          <DialogHeader>
            <DialogTitle>标记打款完成</DialogTitle>
            <DialogDescription>
              {pendingCompletion
                ? `确认「${pendingCompletion.record.pluginName}」这笔分成已线下打款。完成后状态不可再变更。`
                : ''}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-1.5">
            <label
              htmlFor="payout-reference"
              className="text-sm font-medium text-foreground"
            >
              打款凭证号
              <span className="ml-1 text-xs font-normal text-muted-foreground">(可选)</span>
            </label>
            <Input
              id="payout-reference"
              value={payoutReference}
              onChange={(event) => setPayoutReference(event.target.value)}
              placeholder="例如银行流水号或转账单号"
              data-testid="payout-reference-input"
            />
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm">
                取消
              </Button>
            </DialogClose>
            <Button
              size="sm"
              disabled={advancingId !== null}
              onClick={() => {
                if (!pendingCompletion) return

                void advance(
                  pendingCompletion.record,
                  'completed',
                  payoutReference.trim() || undefined,
                )
              }}
            >
              确认完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
