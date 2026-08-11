import { memo, useCallback, useState } from 'react'
import { Check, ChevronDown, Loader2, ShieldAlert, X } from 'lucide-react'

import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { StatusDot } from './StatusBadge'

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
    className: 'bg-surface-elevated text-muted',
  },
  in_progress: {
    label: '执行中',
    className: 'bg-info/15 text-info',
  },
  awaiting_permission: {
    label: '需要授权',
    className: 'bg-warning/15 text-warning',
  },
  completed: {
    label: '已完成',
    className: 'bg-success/15 text-success',
  },
  failed: {
    label: '失败',
    className: 'bg-error/15 text-error',
  },
  denied: {
    label: '已拒绝',
    className: 'bg-surface-elevated text-muted',
  },
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

function formatRiskLabel(
  riskLevel?: ToolCallEventData['permissionRequest'] extends infer T
    ? T extends { riskLevel?: infer R }
      ? R
      : never
    : never,
): string {
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
  const [submitting, setSubmitting] = useState<
    'approve_once' | 'approve_session' | 'deny_once' | 'deny_session' | null
  >(null)
  const { submitToolPermission } = useExecutionActions()

  const isTerminal =
    tc.status === 'completed' ||
    tc.status === 'failed' ||
    tc.status === 'denied'

  const handlePermission = useCallback(
    async (
      action: 'approve' | 'deny',
      rememberScope: 'none' | 'conversation_category' = 'none',
    ) => {
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
        if (rememberScope === 'none') {
          await submitToolPermission(executionId, stepId, tc.id, action)
          return
        }

        await submitToolPermission(
          executionId,
          stepId,
          tc.id,
          action,
          rememberScope,
        )
      } finally {
        setSubmitting(null)
      }
    },
    [executionId, stepId, tc.id, submitToolPermission],
  )

  const cfg = statusConfig[tc.status]
  const permissionRequest = tc.permissionRequest
  const diffPreview = stringifyDiffPreview(permissionRequest?.diffPreview)

  return (
    <div
      className="rounded-card border border-border bg-surface p-3"
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
            className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted transition-colors hover:text-foreground"
            onClick={() => setArgsExpanded((v) => !v)}
          >
            <ChevronDown
              className={`size-3 transition-transform ${argsExpanded ? '' : '-rotate-90'}`}
            />
            参数
          </button>
          {argsExpanded && (
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-elevated px-2 py-1.5 font-mono text-[11px] leading-5 text-muted">
              {JSON.stringify(tc.args, null, 2)}
            </pre>
          )}
        </div>
      )}

      {isTerminal && tc.result != null && (
        <div className="mt-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
            结果
          </p>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-elevated px-2 py-1.5 font-mono text-[11px] leading-5 text-success">
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
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warning" size="sm">
              {formatPermissionCategoryLabel(permissionRequest?.category)}
            </Badge>
            <Badge variant="outline" size="sm">
              {formatRiskLabel(permissionRequest?.riskLevel)}
            </Badge>
          </div>

          {permissionRequest?.description && (
            <div className="flex items-start gap-1.5 rounded-md bg-warning/10 px-2 py-1.5">
              <ShieldAlert className="mt-0.5 size-3 shrink-0 text-warning" />
              <p className="text-[11px] leading-4 text-warning">
                {permissionRequest.description}
              </p>
            </div>
          )}

          {(permissionRequest?.sourceLabel ||
            permissionRequest?.targetLabel ||
            permissionRequest?.targetType) && (
            <div className="grid gap-1 rounded-md border border-border bg-surface-elevated px-2 py-2 text-[11px] text-muted">
              {permissionRequest?.sourceLabel && (
                <div>
                  请求来源:{' '}
                  <span className="text-foreground">
                    {permissionRequest.sourceLabel}
                  </span>
                </div>
              )}
              {(permissionRequest?.targetLabel ||
                permissionRequest?.targetType) && (
                <div>
                  目标对象:{' '}
                  <span className="text-foreground">
                    {[permissionRequest.targetType, permissionRequest.targetLabel]
                      .filter(Boolean)
                      .join(' / ')}
                  </span>
                </div>
              )}
            </div>
          )}

          {permissionRequest?.resourcePaths &&
            permissionRequest.resourcePaths.length > 0 && (
              <pre className="overflow-x-auto rounded-md border border-border bg-surface-elevated px-2 py-2 text-[11px] leading-5 text-muted">
                {permissionRequest.resourcePaths.join('\n')}
              </pre>
            )}

          {permissionRequest?.approveEffect && (
            <p className="text-[11px] text-muted">
              批准后:{' '}
              <span className="text-foreground">
                {permissionRequest.approveEffect}
              </span>
            </p>
          )}

          {permissionRequest?.denyEffect && (
            <p className="text-[11px] text-muted">
              拒绝后:{' '}
              <span className="text-foreground">
                {permissionRequest.denyEffect}
              </span>
            </p>
          )}

          {diffPreview && (
            <pre className="overflow-x-auto rounded-md border border-border bg-surface-elevated px-2 py-2 text-[11px] leading-5 text-muted">
              {diffPreview}
            </pre>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              disabled={submitting !== null}
              onClick={() => void handlePermission('approve')}
              data-testid={`tool-call-approve-${tc.id}`}
            >
              {submitting === 'approve_once' ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Check className="size-3" />
              )}
              允许一次
            </Button>
            {permissionRequest?.rememberable && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                disabled={submitting !== null}
                onClick={() =>
                  void handlePermission('approve', 'conversation_category')
                }
                data-testid={`tool-call-approve-session-${tc.id}`}
              >
                {submitting === 'approve_session' ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Check className="size-3" />
                )}
                本会话同类始终允许
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs text-error hover:text-error"
              disabled={submitting !== null}
              onClick={() => void handlePermission('deny')}
              data-testid={`tool-call-deny-${tc.id}`}
            >
              {submitting === 'deny_once' ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <X className="size-3" />
              )}
              拒绝一次
            </Button>
            {permissionRequest?.rememberable && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs text-error hover:text-error"
                disabled={submitting !== null}
                onClick={() =>
                  void handlePermission('deny', 'conversation_category')
                }
                data-testid={`tool-call-deny-session-${tc.id}`}
              >
                {submitting === 'deny_session' ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <X className="size-3" />
                )}
                本会话同类始终拒绝
              </Button>
            )}
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
        <h4 className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
          工具调用
          <span className="ml-1.5 text-[10px] text-foreground">
            ({entries.length})
          </span>
        </h4>
        <div className="flex items-center gap-1.5">
          {hasActive && (
            <StatusDot className="h-1.5 w-1.5 bg-primary" pulse />
          )}
          <ChevronDown
            className={`size-3.5 text-muted transition-transform ${expanded ? '' : '-rotate-90'}`}
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
