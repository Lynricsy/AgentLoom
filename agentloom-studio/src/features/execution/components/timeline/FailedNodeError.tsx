import { memo } from 'react'
import { AlertTriangle } from 'lucide-react'

import type { EvidenceRecord } from '@/features/evidence'
import { Badge } from '@/shared/ui/badge'
import { cn } from '@/shared/lib/utils'
import type { ExecutionStepErrorDetail, TypeMismatchInfo } from '../../types'

import { EvidenceChips } from './EvidenceChips'

interface Rfc7807Error {
  type?: string
  title?: string
  detail?: string
  nodeId?: string
  message?: string
  errors?: ReadonlyArray<{ field: string; message: string }>
  typeMismatch?: TypeMismatchInfo
  attempts?: ReadonlyArray<{
    attempt: number
    message: string
    timestamp: string
  }>
  [key: string]: unknown
}

interface FailedNodeErrorProps {
  errorMessage: string | null
  errorDetail?: ExecutionStepErrorDetail | null
  evidenceRecords?: EvidenceRecord[]
  className?: string
}

/** 已知异常类型 → 中文标签；配色统一走 error 语义，避免用色彩编码低信息量的分类 */
const KNOWN_ERROR_CLASSIFICATIONS = [
  {
    match: ['agentexecutionexception', 'agent-execution'],
    label: 'Agent 执行失败',
  },
  {
    match: ['nodeinputresolutionexception', 'node-input-resolution'],
    label: '节点输入解析失败',
  },
  {
    match: ['invalidsteptransitionexception', 'invalid-step-transition'],
    label: '状态迁移错误',
  },
  {
    match: ['workflowpublishvalidationexception', 'workflow-publish-validation'],
    label: '发布校验失败',
  },
  {
    match: ['workflownotpublishedexception', 'workflow-not-published'],
    label: '工作流未发布',
  },
  {
    match: ['interventionnotallowedexception', 'intervention-not-allowed'],
    label: '人工介入不可用',
  },
] as const

function normalizeErrorType(type: string) {
  return type.toLowerCase().trim()
}

function formatTypeLabel(type: string) {
  return type.trim()
}

function formatTimestamp(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function ErrorClassificationBadge({
  type,
  typeMismatch,
}: {
  type?: string
  typeMismatch?: TypeMismatchInfo
}) {
  if (typeMismatch) {
    return (
      <Badge variant="warning" size="sm">
        Type Mismatch
      </Badge>
    )
  }

  if (!type) {
    return null
  }

  const normalizedType = normalizeErrorType(type)
  const matched = KNOWN_ERROR_CLASSIFICATIONS.find((classification) =>
    classification.match.some((candidate) => normalizedType.includes(candidate)),
  )

  return (
    <Badge variant="error" size="sm">
      {matched?.label ?? formatTypeLabel(type)}
    </Badge>
  )
}

function TypeMismatchComparison({
  typeMismatch,
}: {
  typeMismatch?: TypeMismatchInfo
}) {
  if (!typeMismatch) {
    return null
  }

  return (
    <div className="rounded-card border border-warning/25 bg-warning/5 p-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-warning">
        类型对比
      </p>

      <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
        <div className="min-w-0 rounded-lg border border-warning/20 bg-warning/10 p-2">
          <p className="truncate text-[11px] font-medium text-warning">
            {typeMismatch.sourceType}
          </p>
          <p className="mt-1 break-all text-[11px] text-muted">
            节点 {typeMismatch.sourceNodeId}
            {typeMismatch.sourcePortId ? ` · 端口 ${typeMismatch.sourcePortId}` : ''}
          </p>
        </div>

        <div className="justify-self-center text-sm font-semibold text-muted">
          →
        </div>

        <div className="min-w-0 rounded-lg border border-error/20 bg-error/10 p-2">
          <p className="truncate text-[11px] font-medium text-error">
            {typeMismatch.targetType}
          </p>
          <p className="mt-1 break-all text-[11px] text-muted">
            节点 {typeMismatch.targetNodeId}
            {typeMismatch.targetPortId ? ` · 端口 ${typeMismatch.targetPortId}` : ''}
          </p>
        </div>
      </div>

      {typeMismatch.edgeId && (
        <p className="mt-2 break-all text-[11px] text-muted">
          Edge: {typeMismatch.edgeId}
        </p>
      )}
    </div>
  )
}

function FieldErrorList({
  errors,
}: {
  errors?: ReadonlyArray<{ field: string; message: string }>
}) {
  if (!errors?.length) {
    return null
  }

  return (
    <div className="rounded-card border border-error/20 bg-surface-elevated p-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
        字段错误
      </p>
      <ul className="mt-2 space-y-1.5 text-xs text-foreground">
        {errors.map((error) => (
          <li
            key={`${error.field}:${error.message}`}
            className="rounded-lg border border-error/15 bg-error/5 px-2.5 py-2"
          >
            <span className="font-medium text-error">{error.field}</span>
            <span className="mx-1 text-muted">·</span>
            <span>{error.message}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function tryParseRfc7807(error: string): Rfc7807Error | null {
  try {
    const parsed: unknown = JSON.parse(error)

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      ('title' in parsed || 'detail' in parsed)
    ) {
      return parsed as Rfc7807Error
    }
  } catch {
    return null
  }

  return null
}

function resolveStructuredError(
  errorMessage: string | null,
  errorDetail?: ExecutionStepErrorDetail | null,
): Rfc7807Error | null {
  if (
    errorDetail &&
    (errorDetail.title || errorDetail.detail || errorDetail.type || errorDetail.nodeId)
  ) {
    return {
      title: errorDetail.title ?? undefined,
      detail: errorDetail.detail ?? undefined,
      type: errorDetail.type ?? undefined,
      nodeId: errorDetail.nodeId ?? undefined,
      message: errorDetail.message ?? undefined,
      errors: errorDetail.errors ?? undefined,
      typeMismatch: errorDetail.typeMismatch ?? undefined,
      attempts: errorDetail.attempts?.map((attempt) => ({
        attempt: attempt.attempt,
        message: attempt.error,
        timestamp: attempt.timestamp,
      })),
    }
  }

  if (!errorMessage) {
    return null
  }

  return tryParseRfc7807(errorMessage)
}

export const FailedNodeError = memo(function FailedNodeError({
  errorMessage,
  errorDetail,
  evidenceRecords,
  className,
}: FailedNodeErrorProps) {
  if (!errorMessage && !errorDetail) {
    return null
  }

  const rfc = resolveStructuredError(errorMessage, errorDetail)
  const detailText = rfc?.detail ?? rfc?.message ?? errorMessage
  const nodeErrorEvidenceRecords =
    evidenceRecords?.filter((record) => record.sourceType === 'node_error') ?? []
  const primaryNodeErrorRecord = nodeErrorEvidenceRecords.find(
    (record) => record.packet.sourceType === 'node_error',
  )
  const chipNodeId =
    rfc?.nodeId ??
    (primaryNodeErrorRecord?.packet.sourceType === 'node_error'
      ? primaryNodeErrorRecord.packet.nodeError.nodeId
      : undefined)

  return (
    <div
      className={cn(
        'rounded-card border border-error/30 bg-error/10 px-4 py-3',
        className,
      )}
      data-testid="failed-node-error"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-error" />
        <div className="min-w-0 space-y-1">
          {rfc ? (
            <>
              <p className="text-sm font-medium text-error">
                {rfc.title ?? '执行失败'}
              </p>
              {detailText && (
                <p className="break-words text-xs text-foreground">{detailText}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <ErrorClassificationBadge
                  type={rfc.type}
                  typeMismatch={rfc.typeMismatch}
                />
              </div>
              {rfc.nodeId && (
                <p className="break-all text-[11px] text-muted">
                  Node: {rfc.nodeId}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="break-words text-sm text-error">{errorMessage}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <ErrorClassificationBadge
                  type={errorDetail?.type ?? undefined}
                  typeMismatch={errorDetail?.typeMismatch ?? undefined}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <TypeMismatchComparison typeMismatch={rfc?.typeMismatch} />
        <FieldErrorList errors={rfc?.errors} />

        {!!rfc?.attempts?.length && (
          <details className="rounded-card border border-error/20 bg-surface-elevated px-3 py-2">
            <summary className="cursor-pointer text-[11px] font-medium text-muted">
              重试记录（{rfc.attempts.length}）
            </summary>
            <ul className="mt-2 space-y-2 text-xs text-foreground">
              {rfc.attempts.map((attempt) => (
                <li
                  key={`${attempt.attempt}:${attempt.timestamp}`}
                  className="rounded-lg border border-error/15 bg-error/5 px-2.5 py-2"
                >
                  <p className="font-medium text-error">
                    第 {attempt.attempt} 次 · {formatTimestamp(attempt.timestamp)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed text-muted">
                    {attempt.message}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        )}

        {nodeErrorEvidenceRecords.length > 0 && (
          <EvidenceChips
            count={nodeErrorEvidenceRecords.length}
            executionId={primaryNodeErrorRecord?.executionId}
            nodeId={chipNodeId}
            nodeName={chipNodeId}
            className="border-error/20 bg-error/10 text-error hover:bg-error/15 hover:text-error"
          />
        )}
      </div>
    </div>
  )
})
