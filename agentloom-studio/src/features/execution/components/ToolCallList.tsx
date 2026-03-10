import { memo, useCallback, useState } from 'react'
import { Check, ChevronDown, Loader2, ShieldAlert, X } from 'lucide-react'

import { Button } from '@/shared/ui/button'

import {
  useExecutionActions,
  useToolCalls,
} from '../stores/executionStore'
import type { ToolCallEventData, ToolCallStatus } from '../types'

interface ToolCallListProps {
  nodeId: string
  executionId: string
  stepId: string
}

const statusConfig: Record<
  ToolCallStatus,
  { label: string; className: string }
> = {
  pending: {
    label: '等待中',
    className: 'bg-muted text-muted-foreground',
  },
  in_progress: {
    label: '执行中',
    className: 'bg-primary/20 text-primary animate-pulse',
  },
  awaiting_permission: {
    label: '需要授权',
    className: 'bg-amber-500/20 text-amber-400',
  },
  completed: {
    label: '已完成',
    className: 'bg-emerald-500/20 text-emerald-400',
  },
  failed: {
    label: '失败',
    className: 'bg-error/20 text-error',
  },
  denied: {
    label: '已拒绝',
    className: 'bg-muted text-muted-foreground',
  },
}

function ToolCallCard({
  tc,
  executionId,
  stepId,
}: {
  tc: ToolCallEventData
  executionId: string
  stepId: string
}) {
  const [argsExpanded, setArgsExpanded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { submitToolPermission } = useExecutionActions()

  const isTerminal =
    tc.status === 'completed' ||
    tc.status === 'failed' ||
    tc.status === 'denied'

  const handlePermission = useCallback(
    async (action: 'approve' | 'deny') => {
      setSubmitting(true)
      try {
        await submitToolPermission(executionId, stepId, tc.id, action)
      } finally {
        setSubmitting(false)
      }
    },
    [executionId, stepId, tc.id, submitToolPermission],
  )

  const cfg = statusConfig[tc.status]

  return (
    <div
      className="rounded-lg border border-border/60 bg-card/50 p-3"
      data-testid={`tool-call-${tc.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold text-foreground">
          {tc.tool}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.className}`}
          data-testid={`tool-call-status-${tc.id}`}
        >
          {cfg.label}
        </span>
      </div>

      {tc.args && Object.keys(tc.args).length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
            onClick={() => setArgsExpanded((v) => !v)}
          >
            <ChevronDown
              className={`size-3 transition-transform ${argsExpanded ? '' : '-rotate-90'}`}
            />
            参数
          </button>
          {argsExpanded && (
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#050816] px-2 py-1.5 font-mono text-[11px] leading-5 text-slate-300">
              {JSON.stringify(tc.args, null, 2)}
            </pre>
          )}
        </div>
      )}

      {isTerminal && tc.result != null && (
        <div className="mt-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            结果
          </p>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#050816] px-2 py-1.5 font-mono text-[11px] leading-5 text-emerald-300">
            {typeof tc.result === 'string'
              ? tc.result
              : JSON.stringify(tc.result, null, 2)}
          </pre>
        </div>
      )}

      {isTerminal && tc.error && (
        <div className="mt-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-error">
            错误
          </p>
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md bg-error/5 px-2 py-1.5 font-mono text-[11px] leading-5 text-error">
            {tc.error}
          </pre>
        </div>
      )}

      {tc.status === 'awaiting_permission' && (
        <div className="mt-3 space-y-2">
          {tc.permissionRequest?.description && (
            <div className="flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5">
              <ShieldAlert className="mt-0.5 size-3 shrink-0 text-amber-400" />
              <p className="text-[11px] leading-4 text-amber-300">
                {tc.permissionRequest.description}
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              disabled={submitting}
              onClick={() => handlePermission('approve')}
              data-testid={`tool-call-approve-${tc.id}`}
            >
              {submitting ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Check className="size-3" />
              )}
              批准
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs text-error hover:text-error"
              disabled={submitting}
              onClick={() => handlePermission('deny')}
              data-testid={`tool-call-deny-${tc.id}`}
            >
              {submitting ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <X className="size-3" />
              )}
              拒绝
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export const ToolCallList = memo(function ToolCallList({
  nodeId,
  executionId,
  stepId,
}: ToolCallListProps) {
  const toolCalls = useToolCalls(nodeId)
  const [expanded, setExpanded] = useState(true)

  if (!toolCalls) return null

  const entries = Object.values(toolCalls)
  if (entries.length === 0) return null

  const sorted = [...entries].reverse()

  const hasActive = sorted.some(
    (tc) =>
      tc.status === 'pending' ||
      tc.status === 'in_progress' ||
      tc.status === 'awaiting_permission',
  )

  return (
    <div className="mt-4" data-testid="tool-call-list">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2"
        onClick={() => setExpanded((v) => !v)}
      >
        <h4 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          工具调用
          <span className="ml-1.5 text-[10px] text-foreground">
            ({entries.length})
          </span>
        </h4>
        <div className="flex items-center gap-1.5">
          {hasActive && (
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          )}
          <ChevronDown
            className={`size-3.5 text-muted-foreground transition-transform ${expanded ? '' : '-rotate-90'}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {sorted.map((tc) => (
            <ToolCallCard
              key={tc.id}
              tc={tc}
              executionId={executionId}
              stepId={stepId}
            />
          ))}
        </div>
      )}
    </div>
  )
})
