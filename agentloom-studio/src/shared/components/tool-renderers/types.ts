import type { ComponentType } from 'react'

/**
 * Render state of a tool call, derived from its lifecycle status.
 * - pending: tool just initiated, no params yet
 * - streaming: params received, execution in progress or awaiting permission
 * - completed: execution finished successfully
 * - failed: execution finished with error or was denied
 */
export type ToolRenderState = 'pending' | 'streaming' | 'completed' | 'failed'

/**
 * Props passed to tool renderer Detail components.
 */
export interface ToolRendererProps {
  toolCall: ToolCallData
  state: ToolRenderState
}

/**
 * Props passed to tool renderer Summary components.
 */
export interface ToolSummaryProps {
  toolCall: ToolCallData
  state: ToolRenderState
}

/**
 * Minimal tool call data interface consumed by renderers.
 * This is a cross-feature contract: both agent-conversation ToolCall
 * and execution ToolCallEventData can be adapted to this shape.
 */
export interface ToolCallData {
  id: string
  tool: string
  args?: unknown
  result?: unknown
  error?: string
  status: string
  /** 权限请求描述（awaiting_permission 时使用） */
  permissionDescription?: string
  /** 权限请求涉及的资源路径 */
  permissionResourcePaths?: string[]
  permissionDomain?: string
  permissionCategory?: string
  permissionRiskLevel?: 'low' | 'medium' | 'high'
  permissionSourceLabel?: string
  permissionTargetType?: string
  permissionTargetLabel?: string
  permissionApproveEffect?: string
  permissionDenyEffect?: string
  permissionDiffPreview?: Record<string, unknown>
  permissionRememberable?: boolean
}

/**
 * A tool renderer definition containing summary, detail, and icon components.
 */
export interface ToolRendererDefinition {
  /** Collapsed single-line summary component */
  Summary: ComponentType<ToolSummaryProps>
  /** Expanded detail rendering component */
  Detail: ComponentType<ToolRendererProps>
  /** Icon component (typically from lucide-react) */
  icon: ComponentType<{ className?: string }>
}
