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
    rememberScope?: 'none' | 'conversation_category',
  ) => Promise<void>
}

function formatPermissionCategoryLabel(category?: string): string {
  switch (category) {
    case 'agent_self_canvas_edit':
      return '自编排修改'
    case 'agent_external_edit':
      return '外部 Agent 编辑'
    case 'workflow_edit':
      return 'Workflow 编辑'
    case 'skill_resource_management':
      return 'Skill 资源管理'
    case 'mcp_resource_management':
      return 'MCP 资源管理'
    case 'model_resource_management':
      return '模型资源管理'
    case 'workspace_resource_management':
      return 'Workspace 资源管理'
    case 'workspace_sandbox_binding_adjustment':
      return 'Workspace / Sandbox 绑定'
    case 'sandbox_spec_adjustment':
      return 'Sandbox 规格调整'
    default:
      return category ?? '待审批操作'
  }
}

function formatRiskLabel(riskLevel?: ToolCallData['permissionRiskLevel']): string {
  switch (riskLevel) {
    case 'low':
      return '低风险'
    case 'medium':
      return '中风险'
    case 'high':
      return '高风险'
    default:
      return '待确认'
  }
}

function stringifyDiffPreview(value?: Record<string, unknown>): string | null {
  if (!value) {
    return null
  }

  const summary =
    typeof value.summary === 'string' && value.summary.length > 0
      ? value.summary
      : null

  try {
    const serialized = JSON.stringify(value, null, 2)
    return summary && !serialized.includes(summary)
      ? `${summary}\n\n${serialized}`
      : serialized
  } catch {
    return summary
  }
}

export const ToolCallCard = memo(function ToolCallCard({
  toolCall,
  defaultExpanded = false,
  onResolvePermission,
}: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [submitting, setSubmitting] = useState<
    'approve_once' | 'approve_session' | 'deny_once' | 'deny_session' | null
  >(null)

  const renderer = getToolRenderer(toolCall.tool) ?? defaultRendererDefinition
  const state = deriveRenderState(toolCall.status)
  const Icon = renderer.icon
  const isAwaitingPermission = toolCall.status === 'awaiting_permission'

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev)
  }, [])

  const handlePermission = useCallback(
    async (
      action: 'approve' | 'deny',
      rememberScope: 'none' | 'conversation_category' = 'none',
    ) => {
      if (!onResolvePermission || submitting) return
      const nextSubmitting =
        action === 'approve'
          ? rememberScope === 'conversation_category'
            ? 'approve_session'
            : 'approve_once'
          : rememberScope === 'conversation_category'
            ? 'deny_session'
            : 'deny_once'
      setSubmitting(nextSubmitting)
      try {
        await onResolvePermission(toolCall.id, action, rememberScope)
      } finally {
        setSubmitting(null)
      }
    },
    [onResolvePermission, submitting, toolCall.id],
  )

  const diffPreview = stringifyDiffPreview(toolCall.permissionDiffPreview)

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
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
              {formatPermissionCategoryLabel(toolCall.permissionCategory)}
            </span>
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
              {formatRiskLabel(toolCall.permissionRiskLevel)}
            </span>
          </div>

          {toolCall.permissionDescription && (
            <p className="mt-2 text-[11px] leading-relaxed text-foreground/90">
              {toolCall.permissionDescription}
            </p>
          )}

          {(toolCall.permissionSourceLabel ||
            toolCall.permissionTargetLabel ||
            toolCall.permissionTargetType) && (
            <div className="mt-2 grid gap-1 rounded-md border border-border/40 bg-background/40 p-2 text-[11px] text-muted-foreground">
              {toolCall.permissionSourceLabel && (
                <div>
                  请求来源: <span className="text-foreground/90">{toolCall.permissionSourceLabel}</span>
                </div>
              )}
              {(toolCall.permissionTargetLabel || toolCall.permissionTargetType) && (
                <div>
                  目标对象:{" "}
                  <span className="text-foreground/90">
                    {[toolCall.permissionTargetType, toolCall.permissionTargetLabel]
                      .filter(Boolean)
                      .join(" / ")}
                  </span>
                </div>
              )}
            </div>
          )}

          {toolCall.permissionApproveEffect && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              批准后: <span className="text-foreground/90">{toolCall.permissionApproveEffect}</span>
            </p>
          )}

          {toolCall.permissionDenyEffect && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              拒绝后: <span className="text-foreground/90">{toolCall.permissionDenyEffect}</span>
            </p>
          )}

          {toolCall.permissionResourcePaths && toolCall.permissionResourcePaths.length > 0 && (
            <pre className="mt-2 overflow-x-auto rounded bg-background p-2 text-[11px] text-muted-foreground">
              {toolCall.permissionResourcePaths.join('\n')}
            </pre>
          )}

          {diffPreview && (
            <pre className="mt-2 overflow-x-auto rounded border border-border/40 bg-background p-2 text-[11px] text-muted-foreground">
              {diffPreview}
            </pre>
          )}

          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] text-amber-400">需要授权</span>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border border-success/40 px-2 py-1 text-[11px] text-success transition-colors hover:bg-success/10 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handlePermission('approve')}
              disabled={submitting !== null}
            >
              {submitting === 'approve_once' ? '处理中…' : '允许一次'}
            </button>
            {toolCall.permissionRememberable && (
              <button
                type="button"
                className="rounded border border-success/40 px-2 py-1 text-[11px] text-success transition-colors hover:bg-success/10 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() =>
                  void handlePermission('approve', 'conversation_category')
                }
                disabled={submitting !== null}
              >
                {submitting === 'approve_session'
                  ? '处理中…'
                  : '本会话同类始终允许'}
              </button>
            )}
            <button
              type="button"
              className="rounded border border-error/40 px-2 py-1 text-[11px] text-error transition-colors hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handlePermission('deny')}
              disabled={submitting !== null}
            >
              {submitting === 'deny_once' ? '处理中…' : '拒绝一次'}
            </button>
            {toolCall.permissionRememberable && (
              <button
                type="button"
                className="rounded border border-error/40 px-2 py-1 text-[11px] text-error transition-colors hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() =>
                  void handlePermission('deny', 'conversation_category')
                }
                disabled={submitting !== null}
              >
                {submitting === 'deny_session'
                  ? '处理中…'
                  : '本会话同类始终拒绝'}
              </button>
            )}
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
