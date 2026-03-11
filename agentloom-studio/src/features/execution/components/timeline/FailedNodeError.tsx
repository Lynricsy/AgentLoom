import { memo } from 'react'
import { AlertTriangle } from 'lucide-react'

import type { EvidenceRecord } from '@/features/evidence'
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

const KNOWN_ERROR_CLASSIFICATIONS = [
  {
    match: ['agentexecutionexception', 'agent-execution'],
    label: 'Agent 执行失败',
    className: 'border-rose-400/30 bg-rose-400/10 text-rose-100',
  },
  {
    match: ['nodeinputresolutionexception', 'node-input-resolution'],
    label: '节点输入解析失败',
    className: 'border-orange-400/30 bg-orange-400/10 text-orange-100',
  },
  {
    match: ['invalidsteptransitionexception', 'invalid-step-transition'],
    label: '状态迁移错误',
    className: 'border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-100',
  },
  {
    match: ['workflowpublishvalidationexception', 'workflow-publish-validation'],
    label: '发布校验失败',
    className: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
  },
  {
    match: ['workflownotpublishedexception', 'workflow-not-published'],
    label: '工作流未发布',
    className: 'border-sky-400/30 bg-sky-400/10 text-sky-100',
  },
  {
    match: ['interventionnotallowedexception', 'intervention-not-allowed'],
    label: '人工介入不可用',
    className: 'border-violet-400/30 bg-violet-400/10 text-violet-100',
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
      <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-100">
        Type Mismatch
      </span>
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
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        matched?.className ??
          'border-rose-400/30 bg-rose-400/10 text-rose-100',
      )}
    >
      {matched?.label ?? formatTypeLabel(type)}
    </span>
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
    <div className="rounded-xl border border-amber-400/25 bg-gradient-to-br from-amber-500/10 to-rose-500/10 p-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-amber-100/80">
        类型对比
      </p>

      <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-2">
          <p className="text-[11px] font-medium text-amber-100">
            {typeMismatch.sourceType}
          </p>
          <p className="mt-1 text-[11px] text-amber-100/70">
            节点 {typeMismatch.sourceNodeId}
            {typeMismatch.sourcePortId ? ` · 端口 ${typeMismatch.sourcePortId}` : ''}
          </p>
        </div>

        <div className="justify-self-center text-sm font-semibold text-rose-100/80">
          →
        </div>

        <div className="rounded-lg border border-rose-400/20 bg-rose-400/10 p-2">
          <p className="text-[11px] font-medium text-rose-100">
            {typeMismatch.targetType}
          </p>
          <p className="mt-1 text-[11px] text-rose-100/70">
            节点 {typeMismatch.targetNodeId}
            {typeMismatch.targetPortId ? ` · 端口 ${typeMismatch.targetPortId}` : ''}
          </p>
        </div>
      </div>

      {typeMismatch.edgeId && (
        <p className="mt-2 text-[11px] text-amber-100/60">
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
    <div className="rounded-xl border border-rose-400/20 bg-black/10 p-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-rose-100/70">
        字段错误
      </p>
      <ul className="mt-2 space-y-1.5 text-xs text-rose-100/80">
        {errors.map((error) => (
          <li
            key={`${error.field}:${error.message}`}
            className="rounded-lg border border-rose-400/10 bg-rose-400/5 px-2.5 py-2"
          >
            <span className="font-medium text-rose-100">{error.field}</span>
            <span className="mx-1 text-rose-100/40">·</span>
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
        message: attempt.message ?? attempt.error ?? '未知错误',
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
        'rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3',
        className,
      )}
      data-testid="failed-node-error"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
        <div className="min-w-0 space-y-1">
          {rfc ? (
            <>
              <p className="text-sm font-medium text-rose-300">
                {rfc.title ?? '执行失败'}
              </p>
              {detailText && (
                <p className="text-xs text-rose-300/80">{detailText}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <ErrorClassificationBadge
                  type={rfc.type}
                  typeMismatch={rfc.typeMismatch}
                />
              </div>
              {rfc.nodeId && (
                <p className="text-[11px] text-rose-300/60">
                  Node: {rfc.nodeId}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-rose-300">{errorMessage}</p>
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
          <details className="rounded-xl border border-rose-400/20 bg-black/10 px-3 py-2">
            <summary className="cursor-pointer text-[11px] font-medium text-rose-100/80">
              重试记录（{rfc.attempts.length}）
            </summary>
            <ul className="mt-2 space-y-2 text-xs text-rose-100/75">
              {rfc.attempts.map((attempt) => (
                <li
                  key={`${attempt.attempt}:${attempt.timestamp}`}
                  className="rounded-lg border border-rose-400/10 bg-rose-400/5 px-2.5 py-2"
                >
                  <p className="font-medium text-rose-100">
                    第 {attempt.attempt} 次 · {formatTimestamp(attempt.timestamp)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap leading-relaxed text-rose-100/75">
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
            className="border-rose-400/20 bg-rose-400/10 text-rose-100/80 hover:bg-rose-400/15 hover:text-rose-50"
          />
        )}
      </div>
    </div>
  )
})
