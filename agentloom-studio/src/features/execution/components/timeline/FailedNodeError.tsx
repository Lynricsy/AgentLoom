import { memo } from 'react'
import { AlertTriangle } from 'lucide-react'

import { cn } from '@/shared/lib/utils'

interface Rfc7807Error {
  type?: string
  title?: string
  detail?: string
  nodeId?: string
  [key: string]: unknown
}

interface FailedNodeErrorProps {
  errorMessage: string | null
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
    /* empty */
  }

  return null
}

export const FailedNodeError = memo(function FailedNodeError({
  errorMessage,
  className,
}: FailedNodeErrorProps) {
  if (!errorMessage) {
    return null
  }

  const rfc = tryParseRfc7807(errorMessage)

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
              {rfc.detail && (
                <p className="text-xs text-rose-300/80">{rfc.detail}</p>
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
