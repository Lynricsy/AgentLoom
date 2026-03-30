import { memo, useCallback, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  ShieldAlert,
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { getToolRenderer } from './registry'
import { defaultRendererDefinition } from './DefaultRenderer'
import type { ToolCallData, ToolRenderState } from './types'

/**
 * Derive the render state from the tool call status string.
 */
export function deriveRenderState(status: string): ToolRenderState {
  switch (status) {
    case 'completed':
      return 'completed'
    case 'failed':
    case 'denied':
      return 'failed'
    case 'pending':
      return 'pending'
    case 'in_progress':
    case 'awaiting_permission':
    default:
      return 'streaming'
  }
}

function StatusIndicator({ state }: { state: ToolRenderState }) {
  switch (state) {
    case 'pending':
    case 'streaming':
      return <Loader2 className="size-3.5 shrink-0 animate-spin text-info" />
    case 'completed':
      return <CheckCircle2 className="size-3.5 shrink-0 text-success" />
    case 'failed':
      return <XCircle className="size-3.5 shrink-0 text-error" />
  }
}

export interface ToolCallCardProps {
  toolCall: ToolCallData
  defaultExpanded?: boolean
  /** Optional callback for resolving tool permissions (approve/deny) */
  onResolvePermission?: (
    toolCallId: string,
    action: 'approve' | 'deny',
  ) => Promise<void>
}

export const ToolCallCard = memo(function ToolCallCard({
  toolCall,
  defaultExpanded = false,
  onResolvePermission,
}: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [submitting, setSubmitting] = useState<'approve' | 'deny' | null>(null)

  const renderer = getToolRenderer(toolCall.tool) ?? defaultRendererDefinition
  const state = deriveRenderState(toolCall.status)
  const Icon = renderer.icon
  const isAwaitingPermission = toolCall.status === 'awaiting_permission'

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev)
  }, [])

  const handlePermission = useCallback(
    async (action: 'approve' | 'deny') => {
      if (!onResolvePermission || submitting) return
      setSubmitting(action)
      try {
        await onResolvePermission(toolCall.id, action)
      } finally {
        setSubmitting(null)
      }
    },
    [onResolvePermission, submitting, toolCall.id],
  )

  return (
    <div
      className={cn(
        'rounded-lg border border-border/60 bg-card/50 transition-colors',
        isAwaitingPermission && 'border-amber-500/40',
      )}
      data-testid={`tool-call-card-${toolCall.id}`}
    >
      {/* Collapsed header / summary row */}
      <button
        type="button"
        onClick={toggleExpanded}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-elevated/30"
      >
        {expanded ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}

        <StatusIndicator state={state} />

        <Icon className="size-3.5 shrink-0 text-muted-foreground" />

        <div className="min-w-0 flex-1">
          <renderer.Summary toolCall={toolCall} state={state} />
        </div>

        {isAwaitingPermission && (
          <ShieldAlert className="size-3.5 shrink-0 text-amber-400" />
        )}
      </button>

      {/* Permission approval buttons (shown when awaiting permission) */}
      {isAwaitingPermission && onResolvePermission && (
        <div className="border-t border-border/40 px-3 py-2">
          {toolCall.permissionDescription && (
            <p className="mb-1.5 text-[11px] text-muted-foreground">
              {toolCall.permissionDescription}
            </p>
          )}
          {toolCall.permissionResourcePaths && toolCall.permissionResourcePaths.length > 0 && (
            <pre className="mb-1.5 overflow-x-auto rounded bg-background p-2 text-[11px] text-muted-foreground">
              {toolCall.permissionResourcePaths.join('\n')}
            </pre>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-amber-400">
              需要授权
            </span>
            <div className="ml-auto flex gap-2">
            <button
              type="button"
              className="rounded border border-success/40 px-2 py-1 text-[11px] text-success transition-colors hover:bg-success/10 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handlePermission('approve')}
              disabled={submitting !== null}
            >
              {submitting === 'approve' ? '批准中…' : '批准'}
            </button>
            <button
              type="button"
              className="rounded border border-error/40 px-2 py-1 text-[11px] text-error transition-colors hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handlePermission('deny')}
              disabled={submitting !== null}
            >
              {submitting === 'deny' ? '拒绝中…' : '拒绝'}
            </button>
            </div>
          </div>
        </div>
      )}

      {/* Expanded detail area */}
      {expanded && (
        <div className="max-h-[480px] overflow-y-auto border-t border-border/40 px-3 py-2">
          <renderer.Detail toolCall={toolCall} state={state} />
        </div>
      )}
    </div>
  )
})
