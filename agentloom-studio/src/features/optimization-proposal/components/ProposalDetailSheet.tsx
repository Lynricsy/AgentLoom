import { memo, useCallback, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ExternalLink, FlaskConical, Loader2, Rocket, Undo2 } from 'lucide-react'
import { resolveProblemDetail } from '@/shared/api/problemDetail'
import { Alert } from '@/shared/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { Button, buttonVariants } from '@/shared/ui/button'
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
import { Label } from '@/shared/ui/label'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet'
import { Skeleton } from '@/shared/ui/skeleton'
import { StatusBadge } from '@/shared/ui/status-badge'
import { Textarea } from '@/shared/ui/textarea'
import { useToast } from '@/shared/ui/toast'
import type {
  ProposalDetail,
  ProposalEvaluation,
  ProposalEvaluationArmSummary,
} from '../api/optimizationProposalApi'
import {
  useDismissProposal,
  useProposalDetail,
  usePublishProposal,
  useRollbackProposal,
  useStartEvaluation,
} from '../api/optimizationProposalQueries'
import {
  PROPOSAL_STATUS_META,
  PROPOSAL_TYPE_LABELS,
  VERDICT_META,
  formatPercent,
  formatProposalTimestamp,
  formatProposalValue,
} from '../lib/proposalPresentation'

const MAX_CASES = 10
const DEFAULT_CASES = 3

const RUN_STATUS_LABELS: Record<string, string> = {
  running: '运行中',
  completed: '通过',
  failed: '未通过',
  cancelled: '已取消',
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

function formatCost(value: number | null): string {
  return value === null ? '—' : `$${value.toFixed(4)}`
}

function formatDuration(value: number | null): string {
  return value === null ? '—' : `${(value / 1000).toFixed(1)} 秒`
}

function formatFailureReasons(reasons: ProposalEvaluationArmSummary['teamFailureReasons']): string {
  const entries = Object.entries(reasons)
  return entries.length === 0 ? '—' : entries.map(([reason, count]) => `${reason} × ${count}`).join('，')
}

function EvaluationSection({ evaluation }: { evaluation: ProposalEvaluation }) {
  const summary = evaluation.summary
  const arms: Array<[string, ProposalEvaluationArmSummary | undefined]> = [
    ['基线', summary?.baseline],
    ['候选', summary?.candidate],
  ]

  return (
    <Section title="评测">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>用例 {evaluation.caseCount} 个</span>
        <span>·</span>
        <span>开始于 {formatProposalTimestamp(evaluation.startedAt)}</span>
        {evaluation.status === 'running' ? (
          <StatusBadge tone="info">评测中</StatusBadge>
        ) : null}
        {evaluation.status === 'failed' ? (
          <StatusBadge tone="error">
            {evaluation.failureReason === 'timeout' ? '评测超时' : '评测失败'}
          </StatusBadge>
        ) : null}
        {summary ? (
          <StatusBadge tone={VERDICT_META[summary.verdict].tone} data-testid="proposal-verdict">
            {VERDICT_META[summary.verdict].label}
          </StatusBadge>
        ) : null}
      </div>

      {summary ? (
        <table className="w-full text-xs" data-testid="proposal-evaluation-summary">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-medium">臂</th>
              <th className="py-1 font-medium">通过率</th>
              <th className="py-1 font-medium">平均成本</th>
              <th className="py-1 font-medium">平均时长</th>
              <th className="py-1 font-medium">团队失败原因</th>
            </tr>
          </thead>
          <tbody>
            {arms.map(([label, arm]) =>
              arm ? (
                <tr key={label} className="border-t border-border">
                  <td className="py-1.5 text-foreground">{label}</td>
                  <td className="py-1.5 tabular-nums">
                    {formatPercent(arm.passRate)}（{arm.passed}/{arm.cases}）
                  </td>
                  <td className="py-1.5 tabular-nums">{formatCost(arm.meanCostUsd)}</td>
                  <td className="py-1.5 tabular-nums">{formatDuration(arm.meanDurationMs)}</td>
                  <td className="py-1.5">{formatFailureReasons(arm.teamFailureReasons)}</td>
                </tr>
              ) : null,
            )}
          </tbody>
        </table>
      ) : null}

      <ul className="space-y-1 text-xs">
        {evaluation.runs.map((run) => (
          <li key={run.id} className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">
              {run.arm === 'baseline' ? '基线' : '候选'} · 用例 {run.caseIndex + 1} ·{' '}
              {run.metrics?.executionStatus === 'launch_failed'
                ? '启动失败'
                : (RUN_STATUS_LABELS[run.status] ?? run.status)}
            </span>
            {run.executionId ? (
              <Link
                to="/executions/$executionId"
                params={{ executionId: run.executionId }}
                className={buttonVariants({ variant: 'link', size: 'xs' })}
              >
                查看执行
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  )
}

function EvaluateDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (caseCount: number) => void
  pending: boolean
}) {
  const [caseCount, setCaseCount] = useState(String(DEFAULT_CASES))
  const parsed = Number(caseCount)
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_CASES

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" data-testid="proposal-evaluate-dialog">
        <DialogHeader>
          <DialogTitle>启动评测</DialogTitle>
          <DialogDescription>
            回放该工作流最近 N 次已结束的真实执行输入，分别在当前发布版本与候选版本上运行并比较结果。评测执行会计入执行列表与资源配额。
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            if (valid) onConfirm(parsed)
          }}
        >
          <DialogBody className="flex flex-col gap-1.5">
            <label htmlFor="proposal-case-count">
              <Label>用例数（1–{MAX_CASES}）</Label>
            </label>
            <Input
              id="proposal-case-count"
              type="number"
              min={1}
              max={MAX_CASES}
              value={caseCount}
              onChange={(event) => setCaseCount(event.target.value)}
              data-testid="proposal-case-count-input"
            />
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                取消
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!valid || pending} data-testid="proposal-evaluate-confirm">
              {pending ? <Loader2 className="animate-spin" /> : <FlaskConical />}
              开始评测
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PublishDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
  proposal,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (input: { label?: string; releaseNotes?: string }) => void
  pending: boolean
  proposal: ProposalDetail
}) {
  const [label, setLabel] = useState('')
  const [releaseNotes, setReleaseNotes] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" data-testid="proposal-publish-dialog">
        <DialogHeader>
          <DialogTitle>发布候选版本</DialogTitle>
          <DialogDescription>
            候选版本将成为工作流的发布版本，草稿中的该节点同步为建议值。已在运行的执行不受影响。
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            onConfirm({
              label: label.trim() || undefined,
              releaseNotes: releaseNotes.trim() || undefined,
            })
          }}
        >
          <DialogBody className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="proposal-publish-label">
                <Label>版本标签（可选）</Label>
              </label>
              <Input
                id="proposal-publish-label"
                maxLength={255}
                value={label}
                placeholder={`优化提案 ${proposal.proposalType}`}
                onChange={(event) => setLabel(event.target.value)}
                data-testid="proposal-publish-label"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="proposal-publish-notes">
                <Label>发布说明（可选）</Label>
              </label>
              <Textarea
                id="proposal-publish-notes"
                maxLength={1000}
                value={releaseNotes}
                placeholder={proposal.rationale}
                onChange={(event) => setReleaseNotes(event.target.value)}
                data-testid="proposal-publish-notes"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                取消
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending} data-testid="proposal-publish-confirm">
              {pending ? <Loader2 className="animate-spin" /> : <Rocket />}
              发布
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** 提案详情：理由、证据、补丁、评测结果与按状态可用的操作 */
export const ProposalDetailSheet = memo(function ProposalDetailSheet({
  proposalId,
  onOpenChange,
}: {
  proposalId: string | null
  onOpenChange: (open: boolean) => void
}) {
  const { notify } = useToast()
  const { data: proposal, isLoading, isError, error } = useProposalDetail(proposalId)
  const evaluate = useStartEvaluation()
  const publish = usePublishProposal()
  const rollback = useRollbackProposal()
  const dismiss = useDismissProposal()
  const [dialog, setDialog] = useState<'evaluate' | 'publish' | 'rollback' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleError = useCallback((mutationError: unknown) => {
    setDialog(null)
    setActionError(resolveProblemDetail(mutationError, '操作失败，请稍后重试'))
  }, [])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setActionError(null)
        setDialog(null)
      }
      onOpenChange(open)
    },
    [onOpenChange],
  )

  const status = proposal?.status
  const canEvaluate = status === 'proposed' || status === 'evaluated'
  const canPublish = status === 'evaluated' && proposal?.verdict === 'improved'
  const canRollback = status === 'published'
  const canDismiss = status === 'proposed' || status === 'evaluated'
  const pending = evaluate.isPending || publish.isPending || rollback.isPending || dismiss.isPending

  return (
    <Sheet open={proposalId !== null} onOpenChange={handleOpenChange}>
      <SheetContent className="max-w-xl" data-testid="proposal-detail-sheet">
        <SheetHeader>
          <SheetTitle>
            {proposal ? PROPOSAL_TYPE_LABELS[proposal.proposalType] : '优化提案'}
          </SheetTitle>
          <SheetDescription>
            {proposal ? `${proposal.workflowName} · 节点 ${proposal.nodeId}` : '加载中…'}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-5">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : null}
          {isError ? (
            <Alert variant="error" title="加载提案失败">
              {resolveProblemDetail(error, '未知错误')}
            </Alert>
          ) : null}

          {proposal ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={PROPOSAL_STATUS_META[proposal.status].tone} data-testid="proposal-status">
                  {PROPOSAL_STATUS_META[proposal.status].label}
                </StatusBadge>
                {proposal.verdict ? (
                  <StatusBadge tone={VERDICT_META[proposal.verdict].tone}>
                    {VERDICT_META[proposal.verdict].label}
                  </StatusBadge>
                ) : null}
              </div>

              {actionError ? (
                <Alert variant="error" data-testid="proposal-action-error">
                  {actionError}
                </Alert>
              ) : null}

              <Section title="理由">
                <p className="text-sm text-foreground">{proposal.rationale}</p>
              </Section>

              <Section title="证据">
                <p className="text-xs text-muted-foreground">
                  最近 {proposal.evidence.windowDays} 天 · 样本 {proposal.evidence.sampleCount} ·
                  命中 {proposal.evidence.matchedCount}（{formatPercent(proposal.evidence.matchedRate)}）
                </p>
              </Section>

              <Section title="补丁">
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                  <p className="font-mono text-muted-foreground">{proposal.configPath}</p>
                  <p className="mt-1 tabular-nums text-foreground" data-testid="proposal-patch">
                    {formatProposalValue(proposal, proposal.currentValue)}
                    <span className="px-1.5 text-muted-foreground">→</span>
                    {formatProposalValue(proposal, proposal.proposedValue)}
                  </p>
                </div>
              </Section>

              {proposal.latestEvaluation ? (
                <EvaluationSection evaluation={proposal.latestEvaluation} />
              ) : null}

              {proposal.publishReport?.note ? (
                <Alert variant="warning">{proposal.publishReport.note}</Alert>
              ) : null}

              <Link
                to="/workflows/$workflowId"
                params={{ workflowId: proposal.workflowDefinitionId }}
                className={buttonVariants({ variant: 'link', size: 'xs' })}
              >
                打开画布
                <ExternalLink aria-hidden="true" />
              </Link>
            </>
          ) : null}
        </SheetBody>

        {proposal && (canEvaluate || canPublish || canRollback || canDismiss) ? (
          <SheetFooter>
            {canDismiss ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                data-testid="proposal-dismiss-button"
                onClick={() => {
                  setActionError(null)
                  dismiss.mutate(proposal.id, {
                    onSuccess: () =>
                      notify({
                        variant: 'success',
                        title: '已忽略该提案',
                        description: '该提案不会再参与评测或发布。',
                      }),
                    onError: handleError,
                  })
                }}
              >
                忽略
              </Button>
            ) : null}
            {canRollback ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                data-testid="proposal-rollback-button"
                onClick={() => setDialog('rollback')}
              >
                <Undo2 />
                回滚
              </Button>
            ) : null}
            {canEvaluate ? (
              <Button
                type="button"
                variant={canPublish ? 'outline' : 'default'}
                disabled={pending}
                data-testid="proposal-evaluate-button"
                onClick={() => setDialog('evaluate')}
              >
                <FlaskConical />
                {status === 'evaluated' ? '重新评测' : '评测'}
              </Button>
            ) : null}
            {canPublish ? (
              <Button
                type="button"
                disabled={pending}
                data-testid="proposal-publish-button"
                onClick={() => setDialog('publish')}
              >
                <Rocket />
                发布
              </Button>
            ) : null}
          </SheetFooter>
        ) : null}

        {proposal ? (
          <>
            <EvaluateDialog
              open={dialog === 'evaluate'}
              onOpenChange={(open) => setDialog(open ? 'evaluate' : null)}
              pending={evaluate.isPending}
              onConfirm={(caseCount) => {
                setActionError(null)
                evaluate.mutate(
                  { id: proposal.id, caseCount },
                  {
                    onSuccess: () => {
                      setDialog(null)
                      notify({ variant: 'success', title: '评测已启动', description: '评测在后台运行，完成后自动刷新结论。' })
                    },
                    onError: handleError,
                  },
                )
              }}
            />
            <PublishDialog
              open={dialog === 'publish'}
              onOpenChange={(open) => setDialog(open ? 'publish' : null)}
              pending={publish.isPending}
              proposal={proposal}
              onConfirm={(input) => {
                setActionError(null)
                publish.mutate(
                  { id: proposal.id, ...input },
                  {
                    onSuccess: () => {
                      setDialog(null)
                      notify({
                        variant: 'success',
                        title: '候选版本已发布',
                        description: '新的执行将使用候选版本；可随时回滚。',
                      })
                    },
                    onError: handleError,
                  },
                )
              }}
            />
            <AlertDialog
              open={dialog === 'rollback'}
              onOpenChange={(open) => setDialog(open ? 'rollback' : null)}
            >
              <AlertDialogContent data-testid="proposal-rollback-dialog">
                <AlertDialogTitle>回滚到基线版本？</AlertDialogTitle>
                <AlertDialogDescription>
                  将重新发布提案生成时的基线版本；草稿中该节点仍为建议值时回写为原值。已在运行的执行不受影响。
                </AlertDialogDescription>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction
                    data-testid="proposal-rollback-confirm"
                    onClick={() => {
                      setActionError(null)
                      rollback.mutate(proposal.id, {
                        onSuccess: () =>
                          notify({
                            variant: 'success',
                            title: '已回滚到基线版本',
                            description: '新的执行将使用基线版本。',
                          }),
                        onError: handleError,
                      })
                    }}
                  >
                    回滚
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
})
