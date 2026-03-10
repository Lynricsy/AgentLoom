import { memo } from 'react'
import { AlertTriangle } from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import type { ExecutionStepErrorDetail } from '../../types'

interface Rfc7807Error {
  type?: string
  title?: string
  detail?: string
  nodeId?: string
  message?: string
  [key: string]: unknown
}

interface FailedNodeErrorProps {
  errorMessage: string | null
  errorDetail?: ExecutionStepErrorDetail | null
  className?: string
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
  className,
}: FailedNodeErrorProps) {
  if (!errorMessage) {
    return null
  }

  const rfc = resolveStructuredError(errorMessage, errorDetail)
  const detailText = rfc?.detail ?? rfc?.message

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
              {rfc.type && (
                <p className="text-[11px] text-rose-300/60">
                  Type: {rfc.type}
                </p>
              )}
              {rfc.nodeId && (
                <p className="text-[11px] text-rose-300/60">
                  Node: {rfc.nodeId}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-rose-300">{errorMessage}</p>
          )}
        </div>
      </div>
    </div>
  )
})
