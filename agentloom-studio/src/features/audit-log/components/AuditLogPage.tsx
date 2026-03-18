import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { History, ShieldAlert } from 'lucide-react'

import {
  useCreateEvidenceExport,
  useEvidenceExportDownloadDetail,
  useEvidenceExportJob,
  useRefreshEvidenceExportDownloadDetail,
  type EvidenceExportJob,
  type EvidenceExportRequest,
} from '@/features/evidence'
import { useAuthToken } from '@/features/execution'
import { Pagination } from '@/shared/components'
import { Button, buttonVariants } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Select } from '@/shared/ui/select'

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
    <section className="mt-4 rounded-xl border border-border/60 bg-background/30 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">{statusTitle}</h2>
            {exportJob ? (
              <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                状态：{exportJob.status}
              </span>
            ) : null}
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">{statusDescription}</p>
          {exportJob ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>导出任务：{exportJob.id}</span>
              <span>命中执行：{exportJob.matchedExecutionCount}</span>
              <span>请求时间：{formatTimestamp(exportJob.requestedAt)}</span>
              <span>保留至：{formatTimestamp(exportJob.expiresAt)}</span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={onCreate} disabled={isCreating}>
            {isCreating ? '创建中…' : '创建证据导出'}
          </Button>
          {exportJob ? (
            <Button type="button" variant="outline" onClick={onRefreshStatus}>
              刷新导出状态
            </Button>
          ) : null}
          {exportJob?.status === 'completed' && exportJob.matchedExecutionCount > 0 && downloadUrl ? (
            <a
              className={buttonVariants({ variant: 'outline' })}
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
              variant="outline"
              onClick={onRefreshDownload}
              disabled={isRefreshingDownload}
            >
              {isRefreshingDownload ? '刷新中…' : '刷新下载链接'}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 space-y-2 text-sm">
        {createError ? <p className="text-rose-400">{createError}</p> : null}
        {jobError ? <p className="text-rose-400">{jobError}</p> : null}
        {downloadError ? <p className="text-rose-400">{downloadError}</p> : null}
        {refreshDownloadError ? <p className="text-rose-400">{refreshDownloadError}</p> : null}
        {exportJob?.status === 'failed' && exportJob.lastError ? (
          <p className="text-rose-400">{exportJob.lastError}</p>
        ) : null}
      </div>
    </section>
  )
}

function renderJsonPanel(label: string, value: unknown, testId?: string) {
  return (
    <details open className="rounded-xl border border-border/60 bg-muted/20 p-4">
      <summary className="cursor-pointer text-sm font-medium text-foreground">
        {label}
      </summary>
      <div className="mt-3">
        {value == null ? (
          <p className="text-sm text-muted-foreground">暂无数据</p>
        ) : (
          <pre
            className="max-h-72 overflow-auto rounded-lg bg-muted/60 p-2 text-[11px] leading-relaxed text-muted-foreground"
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
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">审计日志</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          审计日志用于回溯关键配置、资源和执行变更，只对具备合规查看权限的成员开放。
        </p>
      </div>

      <section className="rounded-2xl border border-amber-500/30 bg-surface-elevated p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="rounded-full bg-amber-500/10 p-2 text-amber-300">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">无权访问审计日志</h2>
            <p className="text-sm text-muted-foreground">
              {getForbiddenMessage(authToken, role)}
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

function AuditLogList({
  records,
  selectedAuditLogId,
  onSelect,
}: {
  records: AuditLogRecord[]
  selectedAuditLogId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="space-y-3">
      {records.map((record) => {
        const isSelected = record.id === selectedAuditLogId

        return (
          <button
            key={record.id}
            type="button"
            className={[
              'w-full rounded-xl border p-4 text-left transition-colors',
              isSelected
                ? 'border-primary/40 bg-primary/5 shadow-sm'
                : 'border-border bg-background/40 hover:border-border/80 hover:bg-background/60',
            ].join(' ')}
            data-testid={`audit-log-row-${record.id}`}
            onClick={() => onSelect(record.id)}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground">
                    {record.eventType}
                  </span>
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {record.resourceType}
                  </span>
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {record.actorType}
                  </span>
                </div>
                <p className="text-sm font-medium text-foreground">
                  {record.summary ?? '未提供摘要'}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>资源 ID：{record.resourceId}</span>
                  <span>执行 ID：{record.executionId ?? '—'}</span>
                  <span>操作人：{record.actorId ?? '系统'}</span>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(record.createdAt)}
              </span>
            </div>
          </button>
        )
      })}
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
      <section className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground">
                {detail.eventType}
              </span>
              <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {detail.resourceType}
              </span>
              <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {detail.actorType}
              </span>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">
                {detail.summary ?? '未提供摘要'}
              </h2>
              <p className="text-sm text-muted-foreground">
                记录于 {formatTimestamp(detail.createdAt)}，用于追踪资源与执行相关的配置或状态变更。
              </p>
            </div>
          </div>

          <Button onClick={onLoadSequence} variant="outline">
            查看资源时序
          </Button>
        </div>

        <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              日志 ID
            </p>
            <p className="font-mono text-xs break-all text-foreground">{detail.id}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              资源 ID
            </p>
            <p className="font-mono text-xs break-all text-foreground">{detail.resourceId}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              操作人
            </p>
            <p className="text-foreground">{detail.actorId ?? '系统 / 服务账号'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              执行 ID
            </p>
            <p className="font-mono text-xs break-all text-foreground">
              {detail.executionId ?? '—'}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {renderJsonPanel('变更前', detail.before, 'audit-log-before')}
        {renderJsonPanel('变更后', detail.after, 'audit-log-after')}
        {renderJsonPanel('附加元数据', detail.metadata, 'audit-log-metadata')}
      </section>

      {isSequenceVisible ? (
        <section
          className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm"
          data-testid="audit-log-sequence"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-foreground">资源时序</h3>
              <p className="text-sm text-muted-foreground">
                同一资源的审计记录按时间顺序展示，便于回溯状态演进。
              </p>
            </div>
            <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {sequenceRecords.length} 条记录
            </span>
          </div>

          {isSequenceLoading ? (
            <p className="mt-4 text-sm text-muted-foreground">加载资源时序中…</p>
          ) : null}

          {sequenceError ? (
            <p className="mt-4 text-sm text-rose-400">{sequenceError}</p>
          ) : null}

          {!isSequenceLoading && !sequenceError ? (
            <div className="mt-4 space-y-3">
              {sequenceRecords.length > 0 ? (
                sequenceRecords.map((record) => (
                  <div
                    key={record.id}
                    className={[
                      'rounded-xl border p-4',
                      record.id === detail.id
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border/60 bg-background/30',
                    ].join(' ')}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          {record.summary ?? '未提供摘要'}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{record.eventType}</span>
                          <span>{record.actorType}</span>
                          <span>{record.actorId ?? '系统'}</span>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatTimestamp(record.createdAt)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">该资源暂无额外时序记录。</p>
              )}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

function AuditLogContent() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">审计日志</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            按时间、事件、资源与操作人筛选关键变更记录，并查看变更前后内容与同资源时序。
          </p>
        </div>
        <div className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
          仅 owner / admin 可访问
        </div>
      </div>

      <form
        className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm"
        onSubmit={handleApplyFilters}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-2 text-sm text-foreground" htmlFor="audit-log-filter-from">
            <span>开始时间</span>
            <Input
              id="audit-log-filter-from"
              type="datetime-local"
              value={filterForm.from}
              onChange={(event) => handleFilterChange('from', event)}
            />
          </label>
          <label className="space-y-2 text-sm text-foreground" htmlFor="audit-log-filter-to">
            <span>结束时间</span>
            <Input
              id="audit-log-filter-to"
              type="datetime-local"
              value={filterForm.to}
              onChange={(event) => handleFilterChange('to', event)}
            />
          </label>
          <label className="space-y-2 text-sm text-foreground" htmlFor="audit-log-filter-event-type">
            <span>事件类型</span>
            <Input
              id="audit-log-filter-event-type"
              placeholder="如 workflow.updated"
              value={filterForm.eventType}
              onChange={(event) => handleFilterChange('eventType', event)}
            />
          </label>
          <label className="space-y-2 text-sm text-foreground" htmlFor="audit-log-filter-resource-type">
            <span>资源类型</span>
            <Input
              id="audit-log-filter-resource-type"
              placeholder="如 workflow_definition"
              value={filterForm.resourceType}
              onChange={(event) => handleFilterChange('resourceType', event)}
            />
          </label>
          <label className="space-y-2 text-sm text-foreground" htmlFor="audit-log-filter-resource-id">
            <span>资源 ID</span>
            <Input
              id="audit-log-filter-resource-id"
              placeholder="resource-id"
              value={filterForm.resourceId}
              onChange={(event) => handleFilterChange('resourceId', event)}
            />
          </label>
          <label className="space-y-2 text-sm text-foreground" htmlFor="audit-log-filter-execution-id">
            <span>执行 ID</span>
            <Input
              id="audit-log-filter-execution-id"
              placeholder="execution-id"
              value={filterForm.executionId}
              onChange={(event) => handleFilterChange('executionId', event)}
            />
          </label>
          <label className="space-y-2 text-sm text-foreground" htmlFor="audit-log-filter-actor-type">
            <span>操作人类型</span>
            <Select
              id="audit-log-filter-actor-type"
              value={filterForm.actorType}
              onValueChange={(value) => setFilterForm((current) => ({ ...current, actorType: value }))}
            >
              <option value="">全部类型</option>
              {AUDIT_ACTOR_TYPES.map((actorType) => (
                <option key={actorType} value={actorType}>
                  {actorType}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-2 text-sm text-foreground" htmlFor="audit-log-filter-actor-id">
            <span>操作人 ID</span>
            <Input
              id="audit-log-filter-actor-id"
              placeholder="actor-id"
              value={filterForm.actorId}
              onChange={(event) => handleFilterChange('actorId', event)}
            />
          </label>
          <label className="space-y-2 text-sm text-foreground" htmlFor="audit-log-filter-page-size">
            <span>每页条数</span>
            <Select
              id="audit-log-filter-page-size"
              value={String(pageSize)}
              onValueChange={handlePageSizeChange}
            >
              {AUDIT_PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={String(option)}>
                  {option} / 页
                </option>
              ))}
            </Select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="submit">应用筛选</Button>
          <Button type="button" variant="outline" onClick={handleResetFilters}>
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
      </form>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <section className="space-y-4 rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">记录列表</h2>
              <p className="text-sm text-muted-foreground">
                {paginationMeta
                  ? `当前第 ${paginationMeta.page} 页，共 ${paginationMeta.total} 条记录`
                  : '按当前筛选条件查看审计记录'}
              </p>
            </div>
          </div>

          {auditLogsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">加载审计日志中…</p>
          ) : null}

          {auditLogsQuery.error ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
              <p className="text-sm font-medium text-foreground">审计日志加载失败</p>
              <p className="mt-1 text-sm text-rose-400">{listError}</p>
            </div>
          ) : null}

          {!auditLogsQuery.isLoading && !auditLogsQuery.error && records.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-background/30 p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
                <History className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">还没有匹配的审计记录</p>
            </div>
          ) : null}

          {!auditLogsQuery.isLoading && !auditLogsQuery.error && records.length > 0 ? (
            <>
              <AuditLogList
                records={records}
                selectedAuditLogId={resolvedSelectedAuditLogId}
                onSelect={(id) => {
                  setIsSequenceVisible(false)
                  setSelectedAuditLogId(id)
                }}
              />

              <Pagination
                page={paginationMeta?.page ?? page}
                totalPages={paginationMeta?.totalPages ?? 1}
                onPageChange={setPage}
                isLoading={auditLogsQuery.isFetching}
              />
            </>
          ) : null}
        </section>

        <section className="space-y-4">
          {resolvedSelectedAuditLogId == null && !auditLogsQuery.isLoading ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface-elevated p-8 text-center shadow-sm">
              <p className="text-sm text-muted-foreground">
                选择一条审计记录后，这里会显示结构化详情、变更前后内容与附加元数据。
              </p>
            </div>
          ) : null}

          {resolvedSelectedAuditLogId != null && detailQuery.isLoading ? (
            <div className="rounded-2xl border border-border bg-surface-elevated p-6 shadow-sm">
              <p className="text-sm text-muted-foreground">加载审计详情中…</p>
            </div>
          ) : null}

          {resolvedSelectedAuditLogId != null && detailQuery.error ? (
            <div className="rounded-2xl border border-rose-500/30 bg-surface-elevated p-6 shadow-sm">
              <p className="text-sm font-medium text-foreground">审计详情加载失败</p>
              <p className="mt-1 text-sm text-rose-400">{detailError}</p>
            </div>
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
