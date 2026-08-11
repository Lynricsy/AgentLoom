import { useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { FileSearch, History, ShieldAlert } from 'lucide-react'

import {
  useCreateEvidenceExport,
  useEvidenceExportDownloadDetail,
  useEvidenceExportJob,
  useRefreshEvidenceExportDownloadDetail,
  type EvidenceExportJob,
  type EvidenceExportRequest,
} from '@/features/evidence'
import { useAuthToken } from '@/features/execution'
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/DataTable'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { cn } from '@/shared/lib/utils'
import { Badge } from '@/shared/ui/badge'
import { Button, buttonVariants } from '@/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'

import { useAuditLogDetail, useAuditLogResourceSequence, useAuditLogs } from '../hooks/useAuditLogs'
import {
  canAccessAuditLogs,
  getAuditLogRoleFromToken,
} from '../lib/auditLogPermissions'
import {
  AUDIT_ACTOR_TYPES,
  AUDIT_PAGE_SIZE_OPTIONS,
  type AuditActorType,
  type AuditLogDetail,
  type AuditLogListParams,
  type AuditLogRecord,
} from '../types/auditLog'

interface AuditLogFilterFormState {
  from: string
  to: string
  eventType: string
  resourceType: string
  resourceId: string
  executionId: string
  actorType: string
  actorId: string
}

const DEFAULT_PAGE_SIZE = 20

/** Radix Select 不接受空字符串 Item，用哨兵值表达「不筛选」 */
const ANY_ACTOR_TYPE = '__any__'

const EMPTY_FILTER_FORM: AuditLogFilterFormState = {
  from: '',
  to: '',
  eventType: '',
  resourceType: '',
  resourceId: '',
  executionId: '',
  actorType: '',
  actorId: '',
}

/** 导出任务状态 → Badge 语义色 */
const EXPORT_STATUS_VARIANT: Record<
  EvidenceExportJob['status'],
  'default' | 'secondary' | 'success' | 'warning' | 'error'
> = {
  queued: 'secondary',
  running: 'default',
  completed: 'success',
  failed: 'error',
  expired: 'warning',
}

function formatTimestamp(value?: string | null): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function toIsoDateTime(value: string): string | undefined {
  const trimmed = value.trim()

  if (!trimmed) {
    return undefined
  }

  const date = new Date(trimmed)

  if (Number.isNaN(date.getTime())) {
    return undefined
  }

  return date.toISOString()
}

function normalizeString(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeActorType(value: string): AuditActorType | undefined {
  return AUDIT_ACTOR_TYPES.includes(value as AuditActorType)
    ? (value as AuditActorType)
    : undefined
}

function buildAppliedFilters(form: AuditLogFilterFormState): AuditLogListParams {
  return {
    from: toIsoDateTime(form.from),
    to: toIsoDateTime(form.to),
    eventType: normalizeString(form.eventType),
    resourceType: normalizeString(form.resourceType),
    resourceId: normalizeString(form.resourceId),
    executionId: normalizeString(form.executionId),
    actorType: normalizeActorType(form.actorType),
    actorId: normalizeString(form.actorId),
  }
}

function buildEvidenceExportRequest(filters: AuditLogListParams): EvidenceExportRequest {
  const executionId = filters.executionId?.trim()

  return {
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    ...(filters.eventType ? { eventType: filters.eventType } : {}),
    ...(filters.resourceType ? { resourceType: filters.resourceType } : {}),
    ...(filters.resourceId ? { resourceId: filters.resourceId } : {}),
    ...(executionId ? { executionId } : {}),
    ...(filters.actorType ? { actorType: filters.actorType } : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    includeAuditMetadata: true,
  }
}

function getExportStatusTitle(job: EvidenceExportJob): string {
  switch (job.status) {
    case 'queued':
      return '导出任务已排队'
    case 'running':
      return '导出处理中'
    case 'completed':
      return job.matchedExecutionCount > 0 ? '导出已就绪' : '没有可导出的执行记录'
    case 'failed':
      return '导出失败'
    case 'expired':
      return '导出已过期'
    default:
      return '导出状态未知'
  }
}

function getExportStatusDescription(job: EvidenceExportJob): string {
  switch (job.status) {
    case 'queued':
      return '任务已经提交到服务端队列，可稍后刷新状态查看最新进度。'
    case 'running':
      return '服务端正在生成证据归档文件，完成后会在这里提供下载链接。'
    case 'completed':
      return job.matchedExecutionCount > 0
        ? '下载链接由服务端按时效签发，可在失效前直接下载导出文件。'
        : '当前筛选条件没有命中可导出的执行记录，因此不会生成归档文件。'
    case 'failed':
      return '导出任务未能完成，请检查错误信息后重试或调整筛选条件。'
    case 'expired':
      return '导出保留窗口已经结束，请重新创建导出任务以获取新的归档文件。'
    default:
      return '正在同步导出任务状态。'
  }
}

/** 筛选表单字段：统一 label 与控件的间距、字号 */
function FilterField({
  htmlFor,
  label,
  children,
}: {
  htmlFor: string
  label: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-muted" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  )
}

function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium text-error">{children}</p>
}

function EvidenceExportPanel({
  exportJob,
  downloadUrl,
  isCreating,
  isRefreshingDownload,
  jobError,
  downloadError,
  refreshDownloadError,
  createError,
  onCreate,
  onRefreshStatus,
  onRefreshDownload,
}: {
  exportJob: EvidenceExportJob | null
  downloadUrl: string | null
  isCreating: boolean
  isRefreshingDownload: boolean
  jobError: string | null
  downloadError: string | null
  refreshDownloadError: string | null
  createError: string | null
  onCreate: () => void
  onRefreshStatus: () => void
  onRefreshDownload: () => void
}) {
  const statusTitle = exportJob ? getExportStatusTitle(exportJob) : '证据导出'
  const statusDescription = exportJob
    ? getExportStatusDescription(exportJob)
    : '基于当前筛选条件向服务端发起证据导出任务，并在这里查看状态与下载链接。'

  return (
    <section className="mt-5 rounded-card border border-border bg-surface-elevated p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">{statusTitle}</h2>
            {exportJob ? (
              <Badge variant={EXPORT_STATUS_VARIANT[exportJob.status] ?? 'secondary'} size="sm">
                状态：{exportJob.status}
              </Badge>
            ) : null}
          </div>
          <p className="max-w-2xl text-xs leading-relaxed text-muted">{statusDescription}</p>
          {exportJob ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span>导出任务：{exportJob.id}</span>
              <span>命中执行：{exportJob.matchedExecutionCount}</span>
              <span>请求时间：{formatTimestamp(exportJob.requestedAt)}</span>
              <span>保留至：{formatTimestamp(exportJob.expiresAt)}</span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={onCreate} disabled={isCreating}>
            {isCreating ? '创建中…' : '创建证据导出'}
          </Button>
          {exportJob ? (
            <Button type="button" size="sm" variant="outline" onClick={onRefreshStatus}>
              刷新导出状态
            </Button>
          ) : null}
          {exportJob?.status === 'completed' && exportJob.matchedExecutionCount > 0 && downloadUrl ? (
            <a
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
              href={downloadUrl}
              rel="noreferrer"
              target="_blank"
            >
              下载导出文件
            </a>
          ) : null}
          {exportJob?.status === 'completed' && exportJob.matchedExecutionCount > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRefreshDownload}
              disabled={isRefreshingDownload}
            >
              {isRefreshingDownload ? '刷新中…' : '刷新下载链接'}
            </Button>
          ) : null}
        </div>
      </div>

      {createError || jobError || downloadError || refreshDownloadError ||
      (exportJob?.status === 'failed' && exportJob.lastError) ? (
        <div className="mt-3 space-y-1">
          {createError ? <ErrorText>{createError}</ErrorText> : null}
          {jobError ? <ErrorText>{jobError}</ErrorText> : null}
          {downloadError ? <ErrorText>{downloadError}</ErrorText> : null}
          {refreshDownloadError ? <ErrorText>{refreshDownloadError}</ErrorText> : null}
          {exportJob?.status === 'failed' && exportJob.lastError ? (
            <ErrorText>{exportJob.lastError}</ErrorText>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function JsonPanel({
  label,
  value,
  testId,
}: {
  label: string
  value: unknown
  testId?: string
}) {
  return (
    <details open className="rounded-card border border-border bg-surface-elevated p-3">
      <summary className="cursor-pointer text-xs font-semibold text-foreground">
        {label}
      </summary>
      <div className="mt-2">
        {value == null ? (
          <p className="text-xs text-muted">暂无数据</p>
        ) : (
          <pre
            className="max-h-72 overflow-auto rounded-md bg-background p-2 text-[11px] leading-relaxed text-muted"
            data-testid={testId}
          >
            {stringifyValue(value)}
          </pre>
        )}
      </div>
    </details>
  )
}

function getForbiddenMessage(authToken?: string, role?: string | null) {
  if (!authToken || !role) {
    return '当前未识别到可访问审计日志的租户身份，请使用 owner 或 admin 角色重新登录。'
  }

  return `当前租户角色为 ${role}，只有 owner 和 admin 可以查看审计日志。`
}

function AuditLogForbiddenState({ authToken, role }: { authToken?: string; role?: string | null }) {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid="audit-log-forbidden">
      <PageHeader
        icon={History}
        title="审计日志"
        description="审计日志用于回溯关键配置、资源和执行变更，只对具备合规查看权限的成员开放。"
      />

      <Card className="border-warning/30">
        <CardContent className="flex items-start gap-3 p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-card bg-warning/10 text-warning">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold text-foreground">无权访问审计日志</h2>
            <p className="text-xs leading-relaxed text-muted">
              {getForbiddenMessage(authToken, role)}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function AuditLogDetailView({
  detail,
  sequenceRecords,
  isSequenceVisible,
  isSequenceLoading,
  sequenceError,
  onLoadSequence,
}: {
  detail: AuditLogDetail
  sequenceRecords: AuditLogRecord[]
  isSequenceVisible: boolean
  isSequenceLoading: boolean
  sequenceError: string | null
  onLoadSequence: () => void
}) {
  return (
    <div className="space-y-4" data-testid="audit-log-detail">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" size="sm">
              {detail.eventType}
            </Badge>
            <Badge variant="secondary" size="sm">
              {detail.resourceType}
            </Badge>
            <Badge variant="secondary" size="sm">
              {detail.actorType}
            </Badge>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-base">{detail.summary ?? '未提供摘要'}</CardTitle>
              <p className="text-xs leading-relaxed text-muted">
                记录于 {formatTimestamp(detail.createdAt)}，用于追踪资源与执行相关的配置或状态变更。
              </p>
            </div>

            <Button size="sm" onClick={onLoadSequence} variant="outline" className="shrink-0">
              查看资源时序
            </Button>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              日志 ID
            </p>
            <p className="break-all font-mono text-xs text-foreground">{detail.id}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              资源 ID
            </p>
            <p className="break-all font-mono text-xs text-foreground">{detail.resourceId}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              操作人
            </p>
            <p className="text-xs text-foreground">{detail.actorId ?? '系统 / 服务账号'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              执行 ID
            </p>
            <p className="break-all font-mono text-xs text-foreground">
              {detail.executionId ?? '—'}
            </p>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
        <JsonPanel label="变更前" value={detail.before} testId="audit-log-before" />
        <JsonPanel label="变更后" value={detail.after} testId="audit-log-after" />
        <JsonPanel label="附加元数据" value={detail.metadata} testId="audit-log-metadata" />
      </section>

      {isSequenceVisible ? (
        <Card data-testid="audit-log-sequence">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <CardTitle>资源时序</CardTitle>
                <p className="text-xs text-muted">
                  同一资源的审计记录按时间顺序展示，便于回溯状态演进。
                </p>
              </div>
              <Badge variant="secondary" size="sm">
                {sequenceRecords.length} 条记录
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-2">
            {isSequenceLoading ? (
              <p className="text-xs text-muted" role="status">
                加载资源时序中…
              </p>
            ) : null}

            {sequenceError ? <ErrorText>{sequenceError}</ErrorText> : null}

            {!isSequenceLoading && !sequenceError ? (
              sequenceRecords.length > 0 ? (
                sequenceRecords.map((record) => (
                  <div
                    key={record.id}
                    className={cn(
                      'rounded-card border p-3 transition-colors',
                      record.id === detail.id
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border bg-surface-elevated',
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <p className="text-xs font-medium text-foreground">
                          {record.summary ?? '未提供摘要'}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                          <span>{record.eventType}</span>
                          <span>{record.actorType}</span>
                          <span>{record.actorId ?? '系统'}</span>
                        </div>
                      </div>
                      <span className="text-[11px] text-muted">
                        {formatTimestamp(record.createdAt)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted">该资源暂无额外时序记录。</p>
              )
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function AuditLogContent() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [filterForm, setFilterForm] = useState<AuditLogFilterFormState>(EMPTY_FILTER_FORM)
  const [appliedFilters, setAppliedFilters] = useState<AuditLogListParams>({})
  const [selectedAuditLogId, setSelectedAuditLogId] = useState<string | null>(null)
  const [isSequenceVisible, setIsSequenceVisible] = useState(false)
  const [activeExportId, setActiveExportId] = useState<string | null>(null)

  const createEvidenceExportMutation = useCreateEvidenceExport()
  const exportJobQuery = useEvidenceExportJob(activeExportId ?? undefined)
  const exportJob = exportJobQuery.data?.data ?? null
  const downloadDetailQuery = useEvidenceExportDownloadDetail(activeExportId ?? undefined, {
    enabled:
      exportJob?.status === 'completed' &&
      exportJob.matchedExecutionCount > 0,
  })
  const refreshDownloadMutation = useRefreshEvidenceExportDownloadDetail(
    activeExportId ?? undefined,
  )
  const downloadDetail = downloadDetailQuery.data?.data ?? null

  const listParams = useMemo(
    () => ({
      ...appliedFilters,
      page,
      pageSize,
    }),
    [appliedFilters, page, pageSize],
  )

  const auditLogsQuery = useAuditLogs(listParams)
  const records = auditLogsQuery.data?.data ?? []
  const paginationMeta = auditLogsQuery.data?.meta
  const firstRecordId = records[0]?.id ?? null
  const resolvedSelectedAuditLogId =
    selectedAuditLogId != null && records.some((record) => record.id === selectedAuditLogId)
      ? selectedAuditLogId
      : firstRecordId
  const detailQuery = useAuditLogDetail(resolvedSelectedAuditLogId)
  const selectedRecord = detailQuery.data ?? null
  const showSequence =
    isSequenceVisible &&
    selectedRecord != null &&
    selectedAuditLogId === resolvedSelectedAuditLogId
  const selectedResourceType = selectedRecord?.resourceType ?? null
  const selectedResourceId = selectedRecord?.resourceId ?? null
  const sequenceQuery = useAuditLogResourceSequence(selectedResourceType, selectedResourceId, {
    enabled: false,
  })

  const listError =
    auditLogsQuery.error instanceof Error
      ? auditLogsQuery.error.message
      : '加载审计日志时发生未知错误。'
  const detailError =
    detailQuery.error instanceof Error
      ? detailQuery.error.message
      : '加载审计详情时发生未知错误。'
  const sequenceError =
    sequenceQuery.error instanceof Error
      ? sequenceQuery.error.message
      : null
  const createExportError =
    createEvidenceExportMutation.error instanceof Error
      ? createEvidenceExportMutation.error.message
      : null
  const exportJobError =
    exportJobQuery.error instanceof Error
      ? exportJobQuery.error.message
      : null
  const downloadDetailError =
    downloadDetailQuery.error instanceof Error
      ? downloadDetailQuery.error.message
      : null
  const refreshDownloadError =
    refreshDownloadMutation.error instanceof Error
      ? refreshDownloadMutation.error.message
      : null

  const columns = useMemo<DataTableColumn<AuditLogRecord>[]>(
    () => [
      {
        key: 'createdAt',
        header: '时间',
        className: 'w-[9.5rem]',
        cell: (record) => (
          <div
            className="flex items-center gap-2"
            data-testid={`audit-log-row-${record.id}`}
          >
            <span
              aria-hidden
              className={cn(
                'h-6 w-0.5 shrink-0 rounded-full transition-colors',
                record.id === resolvedSelectedAuditLogId ? 'bg-primary' : 'bg-transparent',
              )}
            />
            <span className="whitespace-nowrap text-xs text-muted">
              {formatTimestamp(record.createdAt)}
            </span>
          </div>
        ),
      },
      {
        key: 'event',
        header: '事件与摘要',
        cell: (record) => (
          <div className="min-w-0 space-y-1">
            <Badge variant="outline" size="sm">
              {record.eventType}
            </Badge>
            <p className="truncate text-xs font-medium text-foreground">
              {record.summary ?? '未提供摘要'}
            </p>
          </div>
        ),
      },
      {
        key: 'resource',
        header: '资源',
        hideBelow: 'md',
        cell: (record) => (
          <div className="min-w-0 space-y-1">
            <p className="text-xs text-foreground">{record.resourceType}</p>
            <p className="truncate font-mono text-[11px] text-muted">{record.resourceId}</p>
          </div>
        ),
      },
      {
        key: 'actor',
        header: '操作人',
        hideBelow: 'lg',
        cell: (record) => (
          <div className="min-w-0 space-y-1">
            <Badge variant="secondary" size="sm">
              {record.actorType}
            </Badge>
            <p className="truncate text-[11px] text-muted">{record.actorId ?? '系统'}</p>
          </div>
        ),
      },
    ],
    [resolvedSelectedAuditLogId],
  )

  function handleFilterChange(
    key: keyof AuditLogFilterFormState,
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    const { value } = event.target
    setFilterForm((current) => ({ ...current, [key]: value }))
  }

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAppliedFilters(buildAppliedFilters(filterForm))
    setPage(1)
  }

  function handleResetFilters() {
    setFilterForm(EMPTY_FILTER_FORM)
    setAppliedFilters({})
    setIsSequenceVisible(false)
    setPage(1)
  }

  function handlePageSizeChange(value: string) {
    const nextPageSize = Number(value)

    if (!Number.isFinite(nextPageSize) || nextPageSize <= 0) {
      return
    }

    setPageSize(nextPageSize)
    setIsSequenceVisible(false)
    setPage(1)
  }

  function handleCreateEvidenceExport() {
    createEvidenceExportMutation.mutate(buildEvidenceExportRequest(appliedFilters), {
      onSuccess: (response) => {
        setActiveExportId(response.data.id)
      },
    })
  }

  function handleRefreshExportStatus() {
    void exportJobQuery.refetch()
  }

  function handleRefreshDownloadLink() {
    refreshDownloadMutation.mutate()
  }

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid="audit-log-page">
      <PageHeader
        icon={History}
        title="审计日志"
        description="按时间、事件、资源与操作人筛选关键变更记录，并查看变更前后内容与同资源时序。"
        actions={<Badge variant="secondary">仅 owner / admin 可访问</Badge>}
      />

      <Card>
        <form onSubmit={handleApplyFilters}>
          <CardContent className="p-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <FilterField htmlFor="audit-log-filter-from" label="开始时间">
                <Input
                  id="audit-log-filter-from"
                  type="datetime-local"
                  value={filterForm.from}
                  onChange={(event) => handleFilterChange('from', event)}
                />
              </FilterField>
              <FilterField htmlFor="audit-log-filter-to" label="结束时间">
                <Input
                  id="audit-log-filter-to"
                  type="datetime-local"
                  value={filterForm.to}
                  onChange={(event) => handleFilterChange('to', event)}
                />
              </FilterField>
              <FilterField htmlFor="audit-log-filter-event-type" label="事件类型">
                <Input
                  id="audit-log-filter-event-type"
                  placeholder="如 workflow.updated"
                  value={filterForm.eventType}
                  onChange={(event) => handleFilterChange('eventType', event)}
                />
              </FilterField>
              <FilterField htmlFor="audit-log-filter-resource-type" label="资源类型">
                <Input
                  id="audit-log-filter-resource-type"
                  placeholder="如 workflow_definition"
                  value={filterForm.resourceType}
                  onChange={(event) => handleFilterChange('resourceType', event)}
                />
              </FilterField>
              <FilterField htmlFor="audit-log-filter-resource-id" label="资源 ID">
                <Input
                  id="audit-log-filter-resource-id"
                  placeholder="resource-id"
                  value={filterForm.resourceId}
                  onChange={(event) => handleFilterChange('resourceId', event)}
                />
              </FilterField>
              <FilterField htmlFor="audit-log-filter-execution-id" label="执行 ID">
                <Input
                  id="audit-log-filter-execution-id"
                  placeholder="execution-id"
                  value={filterForm.executionId}
                  onChange={(event) => handleFilterChange('executionId', event)}
                />
              </FilterField>
              <FilterField htmlFor="audit-log-filter-actor-type" label="操作人类型">
                <Select
                  value={filterForm.actorType === '' ? ANY_ACTOR_TYPE : filterForm.actorType}
                  onValueChange={(value) =>
                    setFilterForm((current) => ({
                      ...current,
                      actorType: value === ANY_ACTOR_TYPE ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger id="audit-log-filter-actor-type">
                    <SelectValue placeholder="全部类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_ACTOR_TYPE}>全部类型</SelectItem>
                    {AUDIT_ACTOR_TYPES.map((actorType) => (
                      <SelectItem key={actorType} value={actorType}>
                        {actorType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField htmlFor="audit-log-filter-actor-id" label="操作人 ID">
                <Input
                  id="audit-log-filter-actor-id"
                  placeholder="actor-id"
                  value={filterForm.actorId}
                  onChange={(event) => handleFilterChange('actorId', event)}
                />
              </FilterField>
              <FilterField htmlFor="audit-log-filter-page-size" label="每页条数">
                <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                  <SelectTrigger id="audit-log-filter-page-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIT_PAGE_SIZE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option} / 页
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="submit" size="sm">
                应用筛选
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={handleResetFilters}>
                重置筛选
              </Button>
            </div>

            <EvidenceExportPanel
              exportJob={exportJob}
              downloadUrl={downloadDetail?.url ?? null}
              isCreating={createEvidenceExportMutation.isPending}
              isRefreshingDownload={refreshDownloadMutation.isPending}
              jobError={exportJobError}
              downloadError={downloadDetailError}
              refreshDownloadError={refreshDownloadError}
              createError={createExportError}
              onCreate={handleCreateEvidenceExport}
              onRefreshStatus={handleRefreshExportStatus}
              onRefreshDownload={handleRefreshDownloadLink}
            />
          </CardContent>
        </form>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">记录列表</h2>
            <p className="text-xs text-muted">
              {paginationMeta
                ? `当前第 ${paginationMeta.page} 页，共 ${paginationMeta.total} 条记录`
                : '按当前筛选条件查看审计记录'}
            </p>
          </div>

          {auditLogsQuery.isLoading ? (
            <p className="text-xs text-muted" role="status">
              加载审计日志中…
            </p>
          ) : null}

          {auditLogsQuery.error ? (
            <div className="rounded-card border border-error/30 bg-error/5 p-4">
              <p className="text-xs font-medium text-foreground">审计日志加载失败</p>
              <p className="mt-1 text-xs text-error">{listError}</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={records}
              rowKey={(record) => record.id}
              loading={auditLogsQuery.isLoading}
              skeletonRows={6}
              onRowClick={(record) => {
                setIsSequenceVisible(false)
                setSelectedAuditLogId(record.id)
              }}
              empty={
                <EmptyState
                  icon={FileSearch}
                  title="还没有匹配的审计记录"
                  description="调整时间范围、事件类型或操作人后重新筛选。"
                />
              }
              pagination={
                paginationMeta
                  ? {
                      page: paginationMeta.page,
                      pageSize: paginationMeta.pageSize,
                      total: paginationMeta.total,
                      onPageChange: setPage,
                    }
                  : undefined
              }
            />
          )}
        </section>

        <section className="min-w-0 space-y-4">
          {resolvedSelectedAuditLogId == null && !auditLogsQuery.isLoading ? (
            <EmptyState
              icon={FileSearch}
              title="尚未选择审计记录"
              description="选择一条审计记录后，这里会显示结构化详情、变更前后内容与附加元数据。"
            />
          ) : null}

          {resolvedSelectedAuditLogId != null && detailQuery.isLoading ? (
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted" role="status">
                  加载审计详情中…
                </p>
              </CardContent>
            </Card>
          ) : null}

          {resolvedSelectedAuditLogId != null && detailQuery.error ? (
            <Card className="border-error/30">
              <CardContent className="space-y-1 p-5">
                <p className="text-xs font-medium text-foreground">审计详情加载失败</p>
                <ErrorText>{detailError}</ErrorText>
              </CardContent>
            </Card>
          ) : null}

          {selectedRecord ? (
            <AuditLogDetailView
              detail={selectedRecord}
              sequenceRecords={sequenceQuery.data ?? []}
              isSequenceVisible={showSequence}
              isSequenceLoading={sequenceQuery.isFetching}
              sequenceError={sequenceError}
              onLoadSequence={() => {
                if (resolvedSelectedAuditLogId) {
                  setSelectedAuditLogId(resolvedSelectedAuditLogId)
                }
                setIsSequenceVisible(true)
                void sequenceQuery.refetch()
              }}
            />
          ) : null}
        </section>
      </div>
    </div>
  )
}

export function AuditLogPage() {
  const authToken = useAuthToken()
  const currentUserRole = getAuditLogRoleFromToken(authToken)

  if (!canAccessAuditLogs(currentUserRole)) {
    return <AuditLogForbiddenState authToken={authToken} role={currentUserRole} />
  }

  return <AuditLogContent />
}
