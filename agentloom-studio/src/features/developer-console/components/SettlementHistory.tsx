import { useCallback, useRef, useState } from 'react'
import { Receipt } from 'lucide-react'

import { DataTable, type DataTableColumn } from '@/shared/components/data-table/DataTable'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
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
  const records = settlements?.data ?? []

  const { notify } = useToast()
  const payoutMutation = useUpdatePayoutStatus()
  const [pendingCompletion, setPendingCompletion] =
    useState<PendingCompletion | null>(null)
  const [payoutReference, setPayoutReference] = useState('')
  const [advancingId, setAdvancingId] = useState<string | null>(null)
  // 对话框退场期间 pendingCompletion 已置 null，描述文案沿用最后一次的记录
  const lastCompletionRef = useRef<PendingCompletion | null>(null)
  if (pendingCompletion) lastCompletionRef.current = pendingCompletion
  const completionRecord = lastCompletionRef.current?.record

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

  const columns: DataTableColumn<SettlementRecord>[] = [
    {
      key: 'period',
      header: '期间',
      nowrap: true,
      cellClassName: 'text-muted-foreground',
      cell: (record) => formatPeriod(record.periodStart, record.periodEnd),
    },
    {
      key: 'pluginName',
      header: '插件名',
      className: 'w-full max-w-0',
      cell: (record) => (
        <span className="block truncate font-medium text-foreground" title={record.pluginName}>
          {record.pluginName}
        </span>
      ),
    },
    {
      key: 'totalExecutions',
      header: '使用量',
      align: 'right',
      nowrap: true,
      cellClassName: 'text-muted-foreground',
      cell: (record) => numberFormatter.format(record.totalExecutions),
    },
    {
      key: 'totalRevenue',
      header: '总收入',
      align: 'right',
      nowrap: true,
      cell: (record) => currencyFormatter.format(parseFloat(record.totalRevenue)),
    },
    {
      key: 'developerShare',
      header: '开发者份额',
      align: 'right',
      nowrap: true,
      cell: (record) => currencyFormatter.format(parseFloat(record.developerShare)),
    },
    {
      key: 'payoutStatus',
      header: '状态',
      nowrap: true,
      cell: (record) => {
        const statusConfig = STATUS_CONFIG[record.payoutStatus]
        return <StatusBadge tone={statusConfig.tone}>{statusConfig.label}</StatusBadge>
      },
    },
  ]

  if (canManagePayouts) {
    columns.push({
      key: 'actions',
      header: '打款操作',
      align: 'right',
      nowrap: true,
      cell: (record) => {
        const transitions = PAYOUT_STATUS_TRANSITIONS[record.payoutStatus]

        return (
          <div className="flex justify-end gap-1.5">
            {transitions.length === 0 ? (
              <span className="text-xs text-muted-foreground">终态</span>
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
                  {advancingId === record.id ? <Spinner size="sm" /> : null}
                  {TRANSITION_LABEL[record.payoutStatus][next]}
                </Button>
              ))
            )}
          </div>
        )
      },
    })
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-base font-semibold text-foreground">结算历史</h3>
      </div>

      <DataTable
        columns={columns}
        data={records}
        rowKey={(record) => record.id}
        loading={isLoading}
        className="rounded-none border-0"
        empty={<EmptyState variant="plain" icon={Receipt} title="暂无结算记录" />}
        pagination={
          settlements
            ? {
                page,
                pageSize: settlements.meta.pageSize,
                total: settlements.meta.total,
                onPageChange,
              }
            : undefined
        }
      />

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
              {completionRecord
                ? `确认「${completionRecord.pluginName}」这笔分成已线下打款。完成后状态不可再变更。`
                : ''}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-1.5">
            <label
              htmlFor="payout-reference"
              className="text-sm font-medium text-foreground"
            >
              打款凭证号
              <span className="ml-1 text-xs font-normal text-muted-foreground">（可选）</span>
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
