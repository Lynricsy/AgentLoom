import { useCallback, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Eye,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react'

import { Pagination } from '@/shared/components/Pagination'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Select } from '@/shared/ui/select'
import { useToast } from '@/shared/ui/toast'
import {
  useDeleteGeneratedAppSubmission,
  useDeleteGeneratedAppSubmissions,
  useGeneratedAppSubmission,
  useGeneratedAppSubmissions,
} from '../api'
import {
  GENERATED_APP_SUBMISSION_STATUS_LABELS,
  formatGeneratedAppDateTime,
  getGeneratedAppSubmissionStatusBadgeClass,
} from '../lib/generatedAppDisplay'
import type {
  GeneratedAppSubmission,
  GeneratedAppSubmissionStatus,
} from '../types'

const PAGE_SIZE = 10
const STATUS_FILTER_ALL = 'all'
const EMPTY_SUBMISSIONS: GeneratedAppSubmission[] = []

type SubmissionStatusFilter =
  | typeof STATUS_FILTER_ALL
  | GeneratedAppSubmissionStatus

const SUBMISSION_STATUS_OPTIONS: Array<{
  value: SubmissionStatusFilter
  label: string
}> = [
  { value: STATUS_FILTER_ALL, label: '全部状态' },
  { value: 'received', label: GENERATED_APP_SUBMISSION_STATUS_LABELS.received },
  { value: 'running', label: GENERATED_APP_SUBMISSION_STATUS_LABELS.running },
  { value: 'completed', label: GENERATED_APP_SUBMISSION_STATUS_LABELS.completed },
  { value: 'failed', label: GENERATED_APP_SUBMISSION_STATUS_LABELS.failed },
]

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

  return `${text.slice(0, 140)}...`
}

function SubmissionStatusBadge({
  status,
}: {
  status: GeneratedAppSubmissionStatus
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
        getGeneratedAppSubmissionStatusBadgeClass(status),
      )}
    >
      {GENERATED_APP_SUBMISSION_STATUS_LABELS[status]}
    </span>
  )
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
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
        {stringifyJson(value)}
      </pre>
    </div>
  )
}

function ErrorReadOnlyPanel({ value }: { value: string | null }) {
  return (
    <div className="min-w-0 space-y-2">
      <h4 className="text-sm font-medium text-foreground">错误状态</h4>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
        {value?.trim() ? value : '暂无'}
      </pre>
    </div>
  )
}

export function GeneratedAppSubmissionsPanel({
  appId,
}: GeneratedAppSubmissionsPanelProps) {
  const { notify } = useToast()
  const [page, setPage] = useState(1)
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
      status:
        statusFilter === STATUS_FILTER_ALL
          ? undefined
          : (statusFilter as GeneratedAppSubmissionStatus),
    }),
    [page, statusFilter],
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

  const handleDeleteSubmission = useCallback(
    async (submission: GeneratedAppSubmission) => {
      const shouldDelete = window.confirm(
        `确认删除提交记录 ${submission.id} 吗？删除后创建者列表、详情和公开结果访问都会收口。`,
      )

      if (!shouldDelete) return

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

  const handleDeleteSelected = useCallback(async () => {
    const ids = Array.from(selectedIds)

    if (ids.length === 0) return

    const shouldDelete = window.confirm(
      `确认删除选中的 ${ids.length} 条提交记录吗？删除后创建者列表、详情和公开结果访问都会收口。`,
    )

    if (!shouldDelete) return

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
  }, [
    deleteSubmissionsMutation,
    notify,
    selectedIds,
    selectedSubmissionId,
  ])

  const selectedSubmission = detailQuery.data

  if (submissionsQuery.isLoading) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在加载提交记录...
      </div>
    )
  }

  if (submissionsQuery.isError) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-rose-500/30 bg-rose-500/5 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-300" />
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
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
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
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>状态筛选</span>
            <Select
              value={statusFilter}
              onValueChange={handleStatusFilterChange}
              aria-label="状态筛选"
              className="min-w-40"
            >
              {SUBMISSION_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDeleteSelected}
            disabled={selectedCount === 0 || isDeleting}
          >
            {deleteSubmissionsMutation.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-3.5 w-3.5" />
            )}
            删除所选
            {selectedCount > 0 ? ` (${selectedCount})` : ''}
          </Button>
        </div>
      </div>

      {submissions.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center">
          <p className="text-sm font-medium text-foreground">暂无提交记录</p>
          <p className="mt-1 text-sm text-muted-foreground">
            终端用户通过公开应用提交后，会在这里展示输入、运行状态和报告。
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2 font-medium">
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
                </th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">
                  状态
                </th>
                <th className="min-w-44 px-3 py-2 font-medium">
                  匿名会话
                </th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">
                  提交时间
                </th>
                <th className="min-w-64 px-3 py-2 font-medium">Input</th>
                <th className="min-w-64 px-3 py-2 font-medium">Result</th>
                <th className="min-w-64 px-3 py-2 font-medium">Report</th>
                <th className="min-w-56 px-3 py-2 font-medium">Error</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {submissions.map((submission) => (
                <tr
                  key={submission.id}
                  className={cn(
                    'align-top',
                    selectedSubmissionId === submission.id
                      ? 'bg-primary/5'
                      : 'hover:bg-muted/30',
                  )}
                >
                  <td className="px-3 py-3">
                    <Checkbox
                      aria-label={`选择提交记录 ${submission.id}`}
                      checked={selectedIds.has(submission.id)}
                      onCheckedChange={(checked) =>
                        handleSelectSubmission(submission.id, checked)
                      }
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <SubmissionStatusBadge status={submission.status} />
                  </td>
                  <td className="px-3 py-3">
                    <code className="break-all text-xs text-muted-foreground">
                      {submission.anonymousSessionId}
                    </code>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                    {formatGeneratedAppDateTime(submission.createdAt)}
                  </td>
                  <td className="px-3 py-3">
                    <SummaryText>{summarizeJson(submission.input)}</SummaryText>
                  </td>
                  <td className="px-3 py-3">
                    <SummaryText>{summarizeJson(submission.result)}</SummaryText>
                  </td>
                  <td className="px-3 py-3">
                    <SummaryText>{summarizeJson(submission.report)}</SummaryText>
                  </td>
                  <td className="px-3 py-3">
                    <SummaryText>
                      {submission.errorMessage?.trim() || '暂无'}
                    </SummaryText>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedSubmissionId(submission.id)}
                        aria-label={`查看提交记录 ${submission.id} 详情`}
                      >
                        <Eye className="mr-2 h-3.5 w-3.5" />
                        查看
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleDeleteSubmission(submission)}
                        disabled={isDeleting}
                        aria-label={`删除提交记录 ${submission.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
        ) : detailQuery.isLoading || detailQuery.isFetching ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载提交详情...
          </div>
        ) : detailQuery.isError || !selectedSubmission ? (
          <div className="flex items-start gap-3 rounded-md border border-rose-500/30 bg-rose-500/5 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-300" />
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
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
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
                  <SubmissionStatusBadge status={selectedSubmission.status} />
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
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                )}
                删除提交记录
              </Button>
            </div>

            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100">
              审计信息仅展示匿名会话、应用版本和时间信息；公开分享
              token 不在创建者详情面板明文展示。
            </div>

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
    </div>
  )
}
