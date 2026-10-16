import { memo, useCallback, useMemo, useState } from 'react'
import { Loader2, Sparkles, TrendingUp } from 'lucide-react'
import { useWorkflowList } from '@/features/workflow'
import { resolveProblemDetail } from '@/shared/api/problemDetail'
import {
  DataTable,
  type DataTableColumn,
} from '@/shared/components/data-table/DataTable'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { Alert } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
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
import { Label } from '@/shared/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { StatusBadge } from '@/shared/ui/status-badge'
import { useToast } from '@/shared/ui/toast'
import {
  PROPOSAL_PAGE_SIZE,
  type ProposalStatus,
  type ProposalSummary,
} from '../api/optimizationProposalApi'
import {
  useAnalyzeWorkflow,
  useProposalList,
} from '../api/optimizationProposalQueries'
import {
  PROPOSAL_STATUS_FILTERS,
  PROPOSAL_STATUS_META,
  PROPOSAL_TYPE_LABELS,
  VERDICT_META,
  formatProposalTimestamp,
  formatProposalValue,
} from '../lib/proposalPresentation'
import { ProposalDetailSheet } from './ProposalDetailSheet'

type StatusFilter = ProposalStatus | 'all'

const AnalyzeWorkflowDialog = memo(function AnalyzeWorkflowDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { notify } = useToast()
  const [workflowId, setWorkflowId] = useState('')
  const workflows = useWorkflowList({ status: 'published', pageSize: 100 })
  const analyze = useAnalyzeWorkflow()

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setWorkflowId('')
        analyze.reset()
      }
      onOpenChange(nextOpen)
    },
    [analyze, onOpenChange],
  )

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault()
      if (!workflowId) return
      analyze.mutate(workflowId, {
        onSuccess: (created) => {
          notify({
            variant: 'success',
            title: created.length > 0 ? `新建 ${created.length} 条优化提案` : '没有新的优化提案',
            description:
              created.length > 0
                ? '可在列表中打开提案并启动评测。'
                : '证据不足以触发提案，或同类提案已在处理中。',
          })
          handleOpenChange(false)
        },
      })
    },
    [analyze, handleOpenChange, notify, workflowId],
  )

  const options = workflows.data?.data ?? []

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm" data-testid="proposal-analyze-dialog">
        <DialogHeader>
          <DialogTitle>分析工作流</DialogTitle>
          <DialogDescription>
            按最近 28 天的团队运行与路由决策证据，为已发布版本中的团队、智能路由节点生成配置修改提案。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label id="analyze-workflow-label">已发布的工作流</Label>
              <Select value={workflowId} onValueChange={setWorkflowId}>
                <SelectTrigger
                  aria-labelledby="analyze-workflow-label"
                  data-testid="proposal-analyze-workflow-select"
                >
                  <SelectValue
                    placeholder={workflows.isLoading ? '加载中…' : '选择工作流'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {options.map((workflow) => (
                    <SelectItem key={workflow.id} value={workflow.id}>
                      {workflow.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {analyze.isError ? (
              <Alert variant="error" data-testid="proposal-analyze-error">
                {resolveProblemDetail(analyze.error, '分析失败，请稍后重试')}
              </Alert>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                取消
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={!workflowId || analyze.isPending}
              data-testid="proposal-analyze-confirm"
            >
              {analyze.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
              开始分析
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
})

/**
 * 监控页「优化提案」：由运行证据生成的工作流节点配置修改提案。
 * 列表只做筛选与入口；评测、发布、回滚、忽略在详情抽屉中进行。
 */
export const OptimizationProposalsBoard = memo(function OptimizationProposalsBoard() {
  const [status, setStatus] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [analyzeOpen, setAnalyzeOpen] = useState(false)

  const { data, isLoading, isError, error } = useProposalList({
    status: status === 'all' ? undefined : status,
    page,
    limit: PROPOSAL_PAGE_SIZE,
  })

  const columns = useMemo<DataTableColumn<ProposalSummary>[]>(
    () => [
      {
        key: 'workflow',
        header: '工作流',
        className: 'max-w-48',
        cell: (proposal) => (
          <span
            className="block truncate text-xs font-medium text-foreground"
            title={proposal.workflowName}
            data-testid={`proposal-row-${proposal.id}`}
          >
            {proposal.workflowName}
          </span>
        ),
      },
      {
        key: 'node',
        header: '节点',
        hideBelow: 'md',
        cell: (proposal) => (
          <span className="block max-w-32 truncate font-mono text-xs text-muted-foreground" title={proposal.nodeId}>
            {proposal.nodeId}
          </span>
        ),
      },
      {
        key: 'type',
        header: '类型',
        className: 'whitespace-nowrap',
        cell: (proposal) => (
          <span className="text-xs text-foreground">
            {PROPOSAL_TYPE_LABELS[proposal.proposalType]}
          </span>
        ),
      },
      {
        key: 'change',
        header: '当前值 → 建议值',
        className: 'whitespace-nowrap',
        cell: (proposal) => (
          <span className="text-xs tabular-nums text-foreground">
            {formatProposalValue(proposal, proposal.currentValue)}
            <span className="px-1 text-muted-foreground">→</span>
            {formatProposalValue(proposal, proposal.proposedValue)}
          </span>
        ),
      },
      {
        key: 'status',
        header: '状态',
        className: 'whitespace-nowrap',
        cell: (proposal) => {
          const meta = PROPOSAL_STATUS_META[proposal.status]
          return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
        },
      },
      {
        key: 'verdict',
        header: '结论',
        className: 'whitespace-nowrap',
        cell: (proposal) => {
          if (!proposal.verdict) {
            return <span className="text-xs text-muted-foreground">—</span>
          }
          const meta = VERDICT_META[proposal.verdict]
          return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
        },
      },
      {
        key: 'createdAt',
        header: '创建时间',
        hideBelow: 'lg',
        className: 'whitespace-nowrap',
        cell: (proposal) => (
          <span className="text-xs text-muted-foreground">
            {formatProposalTimestamp(proposal.createdAt)}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '操作',
        className: 'whitespace-nowrap text-right',
        cell: (proposal) => (
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => setSelectedId(proposal.id)}
            data-testid={`proposal-open-${proposal.id}`}
          >
            详情
          </Button>
        ),
      },
    ],
    [],
  )

  const proposals = data?.data ?? []

  return (
    <div className="space-y-4" data-testid="optimization-proposals-board">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="提案状态筛选" className="flex flex-wrap gap-1.5">
          {PROPOSAL_STATUS_FILTERS.map((option) => {
            const isActive = option.value === status
            return (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={isActive ? 'default' : 'outline'}
                aria-pressed={isActive}
                data-testid={`proposal-filter-${option.value}`}
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
        <Button
          type="button"
          size="sm"
          onClick={() => setAnalyzeOpen(true)}
          data-testid="proposal-analyze-button"
        >
          <Sparkles />
          分析工作流
        </Button>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        提案只修改单个团队或智能路由节点的一项配置。评测会把最近的真实输入同时回放到当前发布版本与候选版本，只有结论为「优于基线」的提案可以发布；发布不影响已在运行的执行，可随时回滚到基线版本。
      </p>

      {isError ? (
        <Alert variant="error" title="加载优化提案失败" data-testid="optimization-proposals-error">
          {resolveProblemDetail(error, '未知错误')}
        </Alert>
      ) : (
        <DataTable
          columns={columns}
          data={proposals}
          loading={isLoading}
          rowKey={(proposal) => proposal.id}
          onRowClick={(proposal) => setSelectedId(proposal.id)}
          empty={
            <div data-testid="optimization-proposals-empty">
              <EmptyState
                variant="plain"
                icon={TrendingUp}
                title="暂无优化提案"
                description="系统每周按运行证据自动分析已发布的工作流，也可以手动分析指定工作流。"
              />
            </div>
          }
          pagination={{
            page,
            pageSize: PROPOSAL_PAGE_SIZE,
            total: data?.meta.total ?? 0,
            onPageChange: setPage,
          }}
        />
      )}

      <AnalyzeWorkflowDialog open={analyzeOpen} onOpenChange={setAnalyzeOpen} />
      <ProposalDetailSheet
        proposalId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
      />
    </div>
  )
})
