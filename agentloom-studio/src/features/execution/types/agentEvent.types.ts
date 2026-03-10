// 客户端 Agent 事件类型 — 与服务端 agent.types.ts 保持对齐

// ─── Tool Call ───

export type ToolCallStatus =
  | 'pending'
  | 'awaiting_permission'
  | 'denied'
  | 'in_progress'
  | 'completed'
  | 'failed'

export type ToolCallTransitionSource = 'runtime' | 'worker' | 'user'

export interface ToolCallTransitionRecord {
  from?: ToolCallStatus
  to: ToolCallStatus
  timestamp: string
  source: ToolCallTransitionSource
}

export interface ToolCallEventData {
  id: string
  tool: string
  status: ToolCallStatus
  transitions?: ToolCallTransitionRecord[]
  args?: Record<string, unknown>
  result?: unknown
  error?: string
  permissionRequest?: {
    description: string
    resourcePaths?: string[]
  }
}

// ─── Agent Event Union ───

export type AgentEventType =
  | 'plan'
  | 'message_chunk'
  | 'tool_call'
  | 'decision'
  | 'done'

export type StopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'tool_use'
  | 'cancelled'
  | 'intervention_required'

export interface PlanEvent {
  type: 'plan'
  title: string
  content: string
}

export interface MessageChunkEvent {
  type: 'message_chunk'
  content: string
}

export interface ToolCallAgentEvent {
  type: 'tool_call'
  call: ToolCallEventData
}

export interface DecisionEvent {
  type: 'decision'
  suggestedContent: string
  confidence?: number
  rationale?: string
}

export interface DoneEvent {
  type: 'done'
  stopReason: StopReason
}

export type AgentEvent =
  | PlanEvent
  | MessageChunkEvent
  | ToolCallAgentEvent
  | DecisionEvent
  | DoneEvent

// ─── Socket 事件 Payload ───

export interface ToolCallStatusPayload {
  stepId: string
  nodeId: string
  toolCallId: string
  tool: string
  status: ToolCallStatus
  args?: Record<string, unknown>
  result?: unknown
  error?: string
}

export interface ToolPermissionRequiredPayload {
  stepId: string
  nodeId: string
  toolCallId: string
  tool: string
  args: Record<string, unknown>
  permissionRequest?: {
    description: string
    resourcePaths?: string[]
  }
  requestedAt: string
}

export interface ToolPermissionResolvedPayload {
  stepId: string
  nodeId: string
  toolCallId: string
  action: 'approve' | 'deny'
}
