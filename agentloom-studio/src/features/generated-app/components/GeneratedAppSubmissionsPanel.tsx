import { useCallback, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Eye,
  Inbox,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react'

import { Pagination } from '@/shared/components/Pagination'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { Spinner } from '@/shared/components/spinner/Spinner'
import { cn } from '@/shared/lib/utils'
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
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { Skeleton } from '@/shared/ui/skeleton'
import { StatusBadge } from '@/shared/ui/status-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table'
import { useToast } from '@/shared/ui/toast'
import {
  useDeleteGeneratedAppSubmission,
  useDeleteGeneratedAppSubmissions,
  useGeneratedAppSubmission,
  useGeneratedAppSubmissions,
} from '../api'
import {
  GENERATED_APP_SUBMISSION_STATUS_META,
  formatGeneratedAppDateTime,
} from '../lib/generatedAppDisplay'
import type {
  GeneratedAppSubmission,
  GeneratedAppSubmissionOrigin,
  GeneratedAppSubmissionStatus,
} from '../types'

const PAGE_SIZE = 10
const STATUS_FILTER_ALL = 'all'
const EMPTY_SUBMISSIONS: GeneratedAppSubmission[] = []

type DeleteTarget =
  | { kind: 'single'; submission: GeneratedAppSubmission }
  | { kind: 'bulk'; ids: string[] }

type SubmissionStatusFilter =
  | typeof STATUS_FILTER_ALL
  | GeneratedAppSubmissionStatus

const SUBMISSION_STATUS_OPTIONS: Array<{
  value: SubmissionStatusFilter
  label: string
}> = [
  { value: STATUS_FILTER_ALL, label: '全部状态' },
  { value: 'received', label: GENERATED_APP_SUBMISSION_STATUS_META.received.label },
  { value: 'running', label: GENERATED_APP_SUBMISSION_STATUS_META.running.label },
  { value: 'completed', label: GENERATED_APP_SUBMISSION_STATUS_META.completed.label },
  { value: 'failed', label: GENERATED_APP_SUBMISSION_STATUS_META.failed.label },
]

/** 默认只看终端用户提交；Gate 5 验收提交单独筛出，不混进业务数据 */
const SUBMISSION_ORIGIN_LABELS: Record<GeneratedAppSubmissionOrigin, string> = {
  public: '终端用户',
  'gate-acceptance': 'Gate 5 验收',
}

interface GeneratedAppSubmissionsPanelProps {
  appId: string
}

function stringifyJson(value: Record<string, unknown> | null): string {
  if (!value || Object.keys(value).length === 0) {
    return '暂无'
  }

  return JSON.stringify(value, null, 2)
}

function summarizeJson(value: Record<string, unknown> | null): string {
  const text = stringifyJson(value).replace(/\s+/g, ' ')

  if (text.length <= 140) {
    return text
  }

  return `${text.slice(0, 140)}…`
}

function SummaryText({ children }: { children: string }) {
  return (
    <span className="line-clamp-2 min-w-0 break-words text-xs text-muted-foreground">
      {children}
    </span>
  )
}

function JsonReadOnlyPanel({
  label,
  value,
}: {
  label: string
  value: Record<string, unknown> | null
}) {
  return (
    <div className="min-w-0 space-y-2">
      <h4 className="text-sm font-medium text-foreground">{label}</h4>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted p-3 text-xs text-muted-foreground">
        {stringifyJson(value)}
      </pre>
    </div>
  )
}

function ErrorReadOnlyPanel({ value }: { value: string | null }) {
  return (
    <div className="min-w-0 space-y-2">
      <h4 className="text-sm font-medium text-foreground">错误状态</h4>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted p-3 text-xs text-muted-foreground">
        {value?.trim() ? value : '暂无'}
      </pre>
    </div>
  )
}

function getStringField(
  value: Record<string, unknown> | null,
  key: string,
): string | null {
  const raw = value?.[key]
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

/** submission.report 的执行引用：执行 id、固定的工作流与版本、未启动原因 */
function ExecutionReferenceBlock({
  submission,
}: {
  submission: GeneratedAppSubmission
}) {
  const report =
    submission.report?.kind === 'generated-app-runtime-execution'
      ? submission.report
      : null
  const notStartedReason = getStringField(report, 'notStartedReason')
  const rows: Array<[string, string | null]> = [
    ['执行 ID', getStringField(report, 'executionId')],
    ['Workflow', getStringField(report, 'workflowDefinitionId')],
    ['固定版本', getStringField(report, 'workflowVersionId')],
  ]

  return (
    <section
      className={cn(
        'space-y-2 rounded-lg border p-3',
        notStartedReason
          ? 'border-warning/30 bg-warning/5'
          : 'border-border bg-muted',
      )}
      data-testid="creator-execution-reference"
    >
      <h4 className="text-sm font-semibold text-foreground">执行引用</h4>
      {report ? (
        <dl className="grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt>{label}</dt>
              <dd className="break-all text-foreground">{value ?? '无'}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-xs text-muted-foreground">
          这条提交没有执行引用（AppSpec v2 之前的历史提交）。
        </p>
      )}
      {notStartedReason ? (
        <p className="break-words text-xs text-warning">
          未启动执行：{notStartedReason}
        </p>
      ) : null}
    </section>
  )
}

export function GeneratedAppSubmissionsPanel({
  appId,
}: GeneratedAppSubmissionsPanelProps) {
  const { notify } = useToast()
  const [page, setPage] = useState(1)
  const [originFilter, setOriginFilter] =
    useState<GeneratedAppSubmissionOrigin>('public')
  const [statusFilter, setStatusFilter] =
    useState<SubmissionStatusFilter>(STATUS_FILTER_ALL)
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<
    string | null
  >(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const listParams = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      origin: originFilter,
      status:
        statusFilter === STATUS_FILTER_ALL
          ? undefined
          : (statusFilter as GeneratedAppSubmissionStatus),
    }),
    [originFilter, page, statusFilter],
  )

  const submissionsQuery = useGeneratedAppSubmissions(appId, listParams)
  const detailQuery = useGeneratedAppSubmission(
    appId,
    selectedSubmissionId ?? undefined,
  )
  const deleteSubmissionMutation = useDeleteGeneratedAppSubmission(appId)
  const deleteSubmissionsMutation = useDeleteGeneratedAppSubmissions(appId)

  const submissions = submissionsQuery.data?.data ?? EMPTY_SUBMISSIONS
  const meta = submissionsQuery.data?.meta
  const visibleIds = useMemo(
    () => submissions.map((submission) => submission.id),
    [submissions],
  )
  const selectedCount = selectedIds.size
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id))
  const isDeleting =
    deleteSubmissionMutation.isPending || deleteSubmissionsMutation.isPending

  const handleStatusFilterChange = useCallback((value: string) => {
    setStatusFilter(value as SubmissionStatusFilter)
    setPage(1)
    setSelectedSubmissionId(null)
    setSelectedIds(new Set())
  }, [])

  const handleOriginFilterChange = useCallback((value: string) => {
    setOriginFilter(value as GeneratedAppSubmissionOrigin)
    setPage(1)
    setSelectedSubmissionId(null)
    setSelectedIds(new Set())
  }, [])

  const handlePageChange = useCallback((nextPage: number) => {
    setPage(nextPage)
    setSelectedSubmissionId(null)
  }, [])

  const handleSelectVisible = useCallback(
    (checked: boolean | 'indeterminate') => {
      setSelectedIds((current) => {
        const next = new Set(current)

        if (checked === true) {
          visibleIds.forEach((id) => next.add(id))
        } else {
          visibleIds.forEach((id) => next.delete(id))
        }

        return next
      })
    },
    [visibleIds],
  )

  const handleSelectSubmission = useCallback(
    (submissionId: string, checked: boolean | 'indeterminate') => {
      setSelectedIds((current) => {
        const next = new Set(current)

        if (checked === true) {
          next.add(submissionId)
        } else {
          next.delete(submissionId)
        }

        return next
      })
    },
    [],
  )

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  // 对话框退场动画期间 deleteTarget 已置空，保留最后一次目标避免文案闪空
  const lastDeleteTargetRef = useRef<DeleteTarget | null>(null)
  if (deleteTarget) {
    lastDeleteTargetRef.current = deleteTarget
  }
  const dialogTarget = deleteTarget ?? lastDeleteTargetRef.current

  const handleDeleteSubmission = useCallback(
    (submission: GeneratedAppSubmission) => {
      setDeleteTarget({ kind: 'single', submission })
    },
    [],
  )

  const handleDeleteSelected = useCallback(() => {
    const ids = Array.from(selectedIds)

    if (ids.length === 0) return

    setDeleteTarget({ kind: 'bulk', ids })
  }, [selectedIds])

  const confirmDeleteSingle = useCallback(
    async (submission: GeneratedAppSubmission) => {
      try {
        const response = await deleteSubmissionMutation.mutateAsync(
          submission.id,
        )

        setSelectedIds((current) => {
          const next = new Set(current)
          next.delete(submission.id)
          return next
        })

        if (selectedSubmissionId === submission.id) {
          setSelectedSubmissionId(null)
        }

        notify({
          title: '提交记录已删除',
          description: `已删除 ${response.deletedCount} 条提交记录。`,
          variant: 'success',
        })
      } catch (error) {
        notify({
          title: '删除提交记录失败',
          description: error instanceof Error ? error.message : '请稍后重试。',
          variant: 'error',
        })
      }
    },
    [deleteSubmissionMutation, notify, selectedSubmissionId],
  )

  const confirmDeleteBulk = useCallback(
    async (ids: string[]) => {
      try {
        const response = await deleteSubmissionsMutation.mutateAsync(ids)

        if (selectedSubmissionId && ids.includes(selectedSubmissionId)) {
          setSelectedSubmissionId(null)
        }

        setSelectedIds(new Set())
        notify({
          title: '提交记录已批量删除',
          description: `已删除 ${response.deletedCount} 条提交记录。`,
          variant: 'success',
        })
      } catch (error) {
        notify({
          title: '批量删除失败',
          description: error instanceof Error ? error.message : '请稍后重试。',
          variant: 'error',
        })
      }
    },
    [deleteSubmissionsMutation, notify, selectedSubmissionId],
  )

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return

    if (deleteTarget.kind === 'single') {
      await confirmDeleteSingle(deleteTarget.submission)
    } else {
      await confirmDeleteBulk(deleteTarget.ids)
    }

    setDeleteTarget(null)
  }, [confirmDeleteBulk, confirmDeleteSingle, deleteTarget])

  const selectedSubmission = detailQuery.data

  if (submissionsQuery.isLoading) {
    return (
      <div className="overflow-hidden rounded-lg border border-border" aria-busy="true">
        <p className="sr-only">正在加载提交记录…</p>
        {/* 表格形态骨架：表头 h-10 + 与真实行（两行摘要）同高的行 */}
        <div className="flex h-10 items-center gap-4 border-b border-border px-3">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-40" />
        </div>
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="flex h-[4.5rem] items-center gap-4 border-b border-border px-3 last:border-b-0"
          >
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 flex-1" />
          </div>
        ))}
      </div>
    )
  }

  if (submissionsQuery.isError) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-error/30 bg-error/5 p-4">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-error" />
        <div className="min-w-0 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              提交记录加载失败
            </h3>
            <p className="break-words text-sm text-muted-foreground">
              请稍后重试，或刷新页面后重新查看。
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void submissionsQuery.refetch()}
          >
            <RefreshCw />
            重新加载
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5" data-testid="generated-app-submissions-panel">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            共 {meta?.total ?? submissions.length} 条提交记录
          </p>
          <p className="text-xs text-muted-foreground">
            提交内容、运行结果、最终报告和错误状态归属创建者租户。
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="space-y-1 text-xs text-muted-foreground">
            <span className="block">来源</span>
            <Select
              value={originFilter}
              onValueChange={handleOriginFilterChange}
            >
              <SelectTrigger aria-label="来源筛选" className="min-w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SUBMISSION_ORIGIN_LABELS).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            <span className="block">状态筛选</span>
            <Select
              value={statusFilter}
              onValueChange={handleStatusFilterChange}
            >
              <SelectTrigger aria-label="状态筛选" className="min-w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBMISSION_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDeleteSelected}
            disabled={selectedCount === 0 || isDeleting}
          >
            {deleteSubmissionsMutation.isPending ? (
              <Spinner size="sm" />
            ) : (
              <Trash2 />
            )}
            删除所选
            {selectedCount > 0 ? ` (${selectedCount})` : ''}
          </Button>
        </div>
      </div>

      {submissions.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="暂无提交记录"
          description={
            originFilter === 'gate-acceptance'
              ? 'Gate 5 浏览器验收经验收令牌提交后，会在这里展示，不计入终端用户提交。'
              : '终端用户通过公开应用提交后，会在这里展示输入、运行状态和结果。'
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="选择当前页提交记录"
                  checked={
                    allVisibleSelected
                      ? true
                      : someVisibleSelected
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={handleSelectVisible}
                />
              </TableHead>
              <TableHead>状态</TableHead>
              <TableHead>来源</TableHead>
              <TableHead className="min-w-44">匿名会话</TableHead>
              <TableHead>提交时间</TableHead>
              <TableHead className="min-w-48">输入</TableHead>
              <TableHead className="min-w-48">结果</TableHead>
              <TableHead className="min-w-48">报告</TableHead>
              <TableHead className="min-w-48">错误</TableHead>
              {/* 操作列固定在右侧，宽表横向滚动时仍可见 */}
              <TableHead className="sticky right-0 border-l border-border bg-surface">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.map((submission) => (
              <TableRow
                key={submission.id}
                className="align-top"
                data-state={
                  selectedSubmissionId === submission.id
                    ? 'selected'
                    : undefined
                }
              >
                <TableCell className="py-3">
                  <Checkbox
                    aria-label={`选择提交记录 ${submission.id}`}
                    checked={selectedIds.has(submission.id)}
                    onCheckedChange={(checked) =>
                      handleSelectSubmission(submission.id, checked)
                    }
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap py-3">
                  <StatusBadge
                    tone={GENERATED_APP_SUBMISSION_STATUS_META[submission.status].tone}
                  >
                    {GENERATED_APP_SUBMISSION_STATUS_META[submission.status].label}
                  </StatusBadge>
                </TableCell>
                <TableCell className="whitespace-nowrap py-3">
                  <Badge
                    variant={
                      submission.origin === 'gate-acceptance'
                        ? 'secondary'
                        : 'outline'
                    }
                    size="sm"
                  >
                    {SUBMISSION_ORIGIN_LABELS[submission.origin]}
                  </Badge>
                </TableCell>
                <TableCell className="py-3">
                  <code className="break-all text-xs text-muted-foreground">
                    {submission.anonymousSessionId}
                  </code>
                </TableCell>
                <TableCell className="whitespace-nowrap py-3 text-xs text-muted-foreground">
                  {formatGeneratedAppDateTime(submission.createdAt)}
                </TableCell>
                <TableCell className="py-3">
                  <SummaryText>{summarizeJson(submission.input)}</SummaryText>
                </TableCell>
                <TableCell className="py-3">
                  <SummaryText>{summarizeJson(submission.result)}</SummaryText>
                </TableCell>
                <TableCell className="py-3">
                  <SummaryText>{summarizeJson(submission.report)}</SummaryText>
                </TableCell>
                <TableCell className="py-3">
                  <SummaryText>
                    {submission.errorMessage?.trim() || '暂无'}
                  </SummaryText>
                </TableCell>
                <TableCell className="sticky right-0 whitespace-nowrap border-l border-border bg-surface py-3">
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedSubmissionId(submission.id)}
                      aria-label={`查看提交记录 ${submission.id} 详情`}
                    >
                      <Eye />
                      查看
                    </Button>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => void handleDeleteSubmission(submission)}
                      disabled={isDeleting}
                      aria-label={`删除提交记录 ${submission.id}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {meta && meta.totalPages > 1 ? (
        <Pagination
          page={page}
          totalPages={meta.totalPages}
          onPageChange={handlePageChange}
          isLoading={submissionsQuery.isFetching}
        />
      ) : null}

      <div className="border-t border-border pt-5">
        {!selectedSubmissionId ? (
          <p className="text-sm text-muted-foreground">
            选择一条提交记录后，可查看完整 input、result、report 和错误信息。
          </p>
        ) : detailQuery.isLoading && !selectedSubmission ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Spinner />
            正在加载提交详情…
          </div>
        ) : detailQuery.isError || !selectedSubmission ? (
          <div className="flex items-start gap-3 rounded-lg border border-error/30 bg-error/5 p-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-error" />
            <div className="min-w-0 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  提交详情加载失败
                </h3>
                <p className="break-words text-sm text-muted-foreground">
                  该提交可能已删除，或当前账号没有访问权限。
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void detailQuery.refetch()}
              >
                <RefreshCw />
                重新加载
              </Button>
            </div>
          </div>
        ) : (
          <article
            className="space-y-4"
            data-testid="generated-app-submission-detail"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    tone={
                      GENERATED_APP_SUBMISSION_STATUS_META[selectedSubmission.status]
                        .tone
                    }
                  >
                    {
                      GENERATED_APP_SUBMISSION_STATUS_META[selectedSubmission.status]
                        .label
                    }
                  </StatusBadge>
                  {detailQuery.isFetching ? (
                    <Badge variant="secondary" size="sm">
                      <Spinner size="sm" className="h-3 w-3" />
                      正在刷新
                    </Badge>
                  ) : null}
                  <code className="break-all rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {selectedSubmission.id}
                  </code>
                </div>
                <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                  <div className="border-l border-border pl-3">
                    <dt>匿名会话</dt>
                    <dd className="break-all text-foreground">
                      {selectedSubmission.anonymousSessionId}
                    </dd>
                  </div>
                  <div className="border-l border-border pl-3">
                    <dt>来源</dt>
                    <dd className="text-foreground">
                      {SUBMISSION_ORIGIN_LABELS[selectedSubmission.origin]}
                    </dd>
                  </div>
                  {selectedSubmission.generationRunId ? (
                    <div className="border-l border-border pl-3">
                      <dt>生成运行</dt>
                      <dd className="break-all text-foreground">
                        {selectedSubmission.generationRunId}
                      </dd>
                    </div>
                  ) : null}
                  <div className="border-l border-border pl-3">
                    <dt>AppSpec 版本</dt>
                    <dd className="text-foreground">
                      v{selectedSubmission.appSpecVersion}
                    </dd>
                  </div>
                  <div className="border-l border-border pl-3">
                    <dt>创建时间</dt>
                    <dd className="text-foreground">
                      {formatGeneratedAppDateTime(selectedSubmission.createdAt)}
                    </dd>
                  </div>
                  <div className="border-l border-border pl-3">
                    <dt>更新时间</dt>
                    <dd className="text-foreground">
                      {formatGeneratedAppDateTime(selectedSubmission.updatedAt)}
                    </dd>
                  </div>
                </dl>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleDeleteSubmission(selectedSubmission)}
                disabled={isDeleting}
              >
                {deleteSubmissionMutation.isPending ? (
                  <Spinner size="sm" />
                ) : (
                  <Trash2 />
                )}
                删除提交记录
              </Button>
            </div>

            <Alert variant="warning">
              审计信息仅展示匿名会话、应用版本和时间信息；公开分享
              token 不在创建者详情面板明文展示。
            </Alert>

            <ExecutionReferenceBlock submission={selectedSubmission} />

            <div className="grid gap-4 lg:grid-cols-2">
              <JsonReadOnlyPanel label="Input" value={selectedSubmission.input} />
              <JsonReadOnlyPanel
                label="Result"
                value={selectedSubmission.result}
              />
              <JsonReadOnlyPanel
                label="Report"
                value={selectedSubmission.report}
              />
              <ErrorReadOnlyPanel value={selectedSubmission.errorMessage} />
            </div>
          </article>
        )}
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {dialogTarget?.kind === 'bulk'
              ? '批量删除提交记录'
              : '删除提交记录'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {dialogTarget?.kind === 'bulk'
              ? `确认删除选中的 ${dialogTarget.ids.length} 条提交记录吗？`
              : `确认删除提交记录 ${dialogTarget?.submission.id ?? ''} 吗？`}
            删除后创建者列表、详情和公开结果访问都会收口。
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault()
                void handleConfirmDelete()
              }}
            >
              {isDeleting ? <Loader2 className="animate-spin" /> : null}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
