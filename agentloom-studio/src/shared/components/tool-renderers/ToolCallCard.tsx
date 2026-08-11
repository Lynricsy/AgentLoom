import { memo, useCallback, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  ShieldAlert,
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { DUR, EASE } from '@/shared/lib/motion'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
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

/** 工具类型色芯片 —— 统一取数据类型令牌，避免各页面各自着色 */
const TOOL_TONE = 'var(--color-type-tool)'

const STATE_META = {
  pending: { label: '排队中', variant: 'secondary' as const },
  streaming: { label: '执行中', variant: 'info' as const },
  completed: { label: '完成', variant: 'success' as const },
  failed: { label: '失败', variant: 'error' as const },
} satisfies Record<
  ToolRenderState,
  { label: string; variant: 'secondary' | 'info' | 'success' | 'error' }
>

function StateIcon({ state }: { state: ToolRenderState }) {
  switch (state) {
    case 'pending':
    case 'streaming':
      return <Loader2 className="size-3 shrink-0 animate-spin" />
    case 'completed':
      return <CheckCircle2 className="size-3 shrink-0" />
    case 'failed':
      return <XCircle className="size-3 shrink-0" />
  }
}

/** 状态徽章：pending / running / success / error 一律走状态色令牌 */
function StatusBadge({
  state,
  awaitingPermission,
}: {
  state: ToolRenderState
  awaitingPermission: boolean
}) {
  if (awaitingPermission) {
    return (
      <Badge variant="warning" size="sm" className="shrink-0">
        <ShieldAlert className="size-3 shrink-0" />
        待授权
      </Badge>
    )
  }

  const meta = STATE_META[state]

  return (
    <Badge variant={meta.variant} size="sm" className="shrink-0">
      <StateIcon state={state} />
      {meta.label}
    </Badge>
  )
}

/** 工具耗时文案；时间戳缺失或时长无效时返回 null */
function formatDuration(startedAt?: number, completedAt?: number): string | null {
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) {
    return null
  }

  const end =
    typeof completedAt === 'number' && Number.isFinite(completedAt)
      ? completedAt
      : startedAt
  const elapsedMs = end - startedAt
  if (elapsedMs <= 0) {
    return null
  }

  if (elapsedMs < 1000) {
    return `${Math.round(elapsedMs)}ms`
  }

  const totalSeconds = elapsedMs / 1000
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds % 60)
  return `${minutes}m ${seconds}s`
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

function riskBadgeVariant(
  riskLevel?: ToolCallData['permissionRiskLevel'],
): 'success' | 'warning' | 'error' | 'outline' {
  switch (riskLevel) {
    case 'low':
      return 'success'
    case 'medium':
      return 'warning'
    case 'high':
      return 'error'
    default:
      return 'outline'
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
  const duration = formatDuration(toolCall.startedAt, toolCall.completedAt)

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
    <Card
      className={cn(
        'overflow-hidden shadow-none transition-colors',
        isAwaitingPermission && 'border-warning/45',
      )}
      data-testid={`tool-call-card-${toolCall.id}`}
    >
      {/* Collapsed header / summary row */}
      <button
        type="button"
        onClick={toggleExpanded}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-elevated/60"
      >
        {expanded ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}

        <span
          aria-hidden
          className="grid size-6 shrink-0 place-items-center rounded-md"
          style={{
            backgroundColor: `color-mix(in srgb, ${TOOL_TONE} 14%, transparent)`,
            color: TOOL_TONE,
          }}
        >
          <Icon className="size-3.5" />
        </span>

        <div className="min-w-0 flex-1">
          <renderer.Summary toolCall={toolCall} state={state} />
        </div>

        {duration ? (
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {duration}
          </span>
        ) : null}

        <StatusBadge state={state} awaitingPermission={isAwaitingPermission} />
      </button>

      {/* Permission approval buttons (shown when awaiting permission) */}
      {isAwaitingPermission && onResolvePermission && (
        <div className="border-t border-border/60 bg-warning/[0.06] px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warning" size="sm">
              {formatPermissionCategoryLabel(toolCall.permissionCategory)}
            </Badge>
            <Badge variant={riskBadgeVariant(toolCall.permissionRiskLevel)} size="sm">
              {formatRiskLabel(toolCall.permissionRiskLevel)}
            </Badge>
          </div>

          {toolCall.permissionDescription && (
            <p className="mt-2 text-xs leading-relaxed text-foreground">
              {toolCall.permissionDescription}
            </p>
          )}

          {(toolCall.permissionSourceLabel ||
            toolCall.permissionTargetLabel ||
            toolCall.permissionTargetType) && (
            <div className="mt-2 grid gap-1 rounded-md border border-border/60 bg-surface px-2.5 py-2 text-[11px] text-muted-foreground">
              {toolCall.permissionSourceLabel && (
                <div>
                  请求来源:{' '}
                  <span className="text-foreground">
                    {toolCall.permissionSourceLabel}
                  </span>
                </div>
              )}
              {(toolCall.permissionTargetLabel || toolCall.permissionTargetType) && (
                <div>
                  目标对象:{' '}
                  <span className="text-foreground">
                    {[toolCall.permissionTargetType, toolCall.permissionTargetLabel]
                      .filter(Boolean)
                      .join(' / ')}
                  </span>
                </div>
              )}
            </div>
          )}

          {toolCall.permissionApproveEffect && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              批准后:{' '}
              <span className="text-foreground">
                {toolCall.permissionApproveEffect}
              </span>
            </p>
          )}

          {toolCall.permissionDenyEffect && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              拒绝后:{' '}
              <span className="text-foreground">{toolCall.permissionDenyEffect}</span>
            </p>
          )}

          {toolCall.permissionResourcePaths &&
            toolCall.permissionResourcePaths.length > 0 && (
              <pre className="mt-2 overflow-x-auto rounded-md bg-surface-elevated px-2.5 py-2 text-[11px] text-muted-foreground">
                {toolCall.permissionResourcePaths.join('\n')}
              </pre>
            )}

          {diffPreview && (
            <pre className="mt-2 overflow-x-auto rounded-md border border-border/60 bg-surface-elevated px-2.5 py-2 text-[11px] text-muted-foreground">
              {diffPreview}
            </pre>
          )}

          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] font-medium text-warning">需要授权</span>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-success/40 text-success hover:border-success/60 hover:bg-success/10"
              onClick={() => void handlePermission('approve')}
              disabled={submitting !== null}
            >
              {submitting === 'approve_once' ? '处理中…' : '允许一次'}
            </Button>
            {toolCall.permissionRememberable && (
              <Button
                size="sm"
                variant="outline"
                className="border-success/40 text-success hover:border-success/60 hover:bg-success/10"
                onClick={() =>
                  void handlePermission('approve', 'conversation_category')
                }
                disabled={submitting !== null}
              >
                {submitting === 'approve_session'
                  ? '处理中…'
                  : '本会话同类始终允许'}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="border-error/40 text-error hover:border-error/60 hover:bg-error/10"
              onClick={() => void handlePermission('deny')}
              disabled={submitting !== null}
            >
              {submitting === 'deny_once' ? '处理中…' : '拒绝一次'}
            </Button>
            {toolCall.permissionRememberable && (
              <Button
                size="sm"
                variant="outline"
                className="border-error/40 text-error hover:border-error/60 hover:bg-error/10"
                onClick={() =>
                  void handlePermission('deny', 'conversation_category')
                }
                disabled={submitting !== null}
              >
                {submitting === 'deny_session'
                  ? '处理中…'
                  : '本会话同类始终拒绝'}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Expanded detail area */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="tool-call-detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DUR.fast, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="max-h-[480px] overflow-y-auto border-t border-border/60 px-3 py-2">
              <renderer.Detail toolCall={toolCall} state={state} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
})
