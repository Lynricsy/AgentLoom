// 客户端执行事件类型 — 与服务端 execution-event.types.ts 保持对齐

import type {
  AgentEvent,
  ToolCallStatusPayload,
  ToolPermissionRequiredPayload,
  ToolPermissionResolvedPayload,
} from './agentEvent.types'
import type { SubAgentEventEnvelope } from '@/features/agent-conversation'
import type { TypeMismatchInfo } from './index'

export const ExecutionEventName = {
  EXECUTION_STATUS_CHANGED: 'execution.status.changed',
  STEP_STATUS_CHANGED: 'execution.node.status-changed',
  STEP_AGENT_EVENT: 'execution.node.agent-event',
  STEP_RETRYING: 'execution.node.retrying',
  OUTPUT_CHUNK: 'execution.node.output-chunk',
  NODE_INTERVENTION_REQUIRED: 'execution.node.intervention-required',
  NODE_INTERVENTION_RESOLVED: 'execution.node.intervention-resolved',
  NODE_TOOL_CALL_STATUS: 'execution.node.tool-call-status',
  NODE_TOOL_PERMISSION_REQUIRED: 'execution.node.tool-permission-required',
  NODE_TOOL_PERMISSION_RESOLVED: 'execution.node.tool-permission-resolved',
} as const

export type ExecutionEventNameValue =
  (typeof ExecutionEventName)[keyof typeof ExecutionEventName]

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type StepStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'waiting_intervention'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled'

export interface ExecutionStatusChangedPayload {
  executionId: string
  status: ExecutionStatus
  completedSteps?: number
  totalSteps?: number
  errorMessage?: string
}

export interface StructuredErrorDetail {
  message: string
  type?: string
  title?: string
  detail?: string
  nodeId?: string
  stack?: string
  errors?: ReadonlyArray<{
    field: string
    message: string
  }>
  typeMismatch?: TypeMismatchInfo
  attempts?: ReadonlyArray<{
    attempt: number
    message: string
    timestamp: string
  }>
}

export interface StepStatusChangedPayload {
  stepId: string
  nodeId: string
  from: StepStatus
  to: StepStatus
  errorDetail?: StructuredErrorDetail
  result?: Record<string, unknown> | null
  checkpointData?: Record<string, unknown> | null
}

export interface StepAgentEventPayload {
  stepId: string
  event: AgentEvent
  subagent?: SubAgentEventEnvelope
}

export interface StepRetryingPayload {
  stepId: string
  attempt: number
  maxAttempts: number
  errorMessage?: string
}

export interface OutputChunkPayload {
  stepId: string
  chunk: string
  index: number
  executionType?: 'workflow' | 'conversation'
}

export interface InterventionDecision {
  suggestedContent?: unknown
  confidence?: number
  rationale?: string
}

export interface InterventionCheckpointRecord {
  requested_at: string
  resolved_at: string
  action: 'approve' | 'modify' | 'reject'
  instruction: unknown | null
  resolved_by_user_id: string
  timeout?: boolean
}

export interface InterventionRequiredPayload {
  stepId: string
  nodeId: string
  nodeName: string
  decision?: InterventionDecision
  partialContent?: string
  requestedAt: string
}

export interface InterventionResolvedPayload {
  stepId: string
  nodeId: string
  action: 'approve' | 'modify' | 'reject'
  feedback?: string
  resolvedBy: string
  resolvedAt: string
  timeout?: boolean
}

export interface ExecutionEvent<T = unknown> {
  eventId: number
  event: ExecutionEventNameValue
  timestamp: string
  executionId: string
  tenantId: string
  data: T
}

export interface StepSnapshot {
  stepId: string
  nodeId: string
  status: StepStatus
  startedAt: string | null
  completedAt: string | null
  errorMessage?: string
  errorDetail?: StructuredErrorDetail
  result?: Record<string, unknown> | null
  checkpointData?: Record<string, unknown> | null
}

export interface ExecutionStateSnapshot {
  executionId: string
  status: ExecutionStatus
  completedSteps: number
  totalSteps: number
  steps: StepSnapshot[]
  snapshotAt: string
  lastEventId?: number
}

export interface SubscribePayload {
  tenantId: string
  executionId: string
  lastEventId?: number
}

export interface UnsubscribePayload {
  tenantId: string
  executionId: string
}

export interface ServerToClientEvents {
  [ExecutionEventName.EXECUTION_STATUS_CHANGED]: (
    event: ExecutionEvent<ExecutionStatusChangedPayload>,
  ) => void
  [ExecutionEventName.STEP_STATUS_CHANGED]: (
    event: ExecutionEvent<StepStatusChangedPayload>,
  ) => void
  [ExecutionEventName.STEP_AGENT_EVENT]: (
    event: ExecutionEvent<StepAgentEventPayload>,
  ) => void
  [ExecutionEventName.STEP_RETRYING]: (
    event: ExecutionEvent<StepRetryingPayload>,
  ) => void
  [ExecutionEventName.OUTPUT_CHUNK]: (
    event: ExecutionEvent<OutputChunkPayload>,
  ) => void
  [ExecutionEventName.NODE_INTERVENTION_REQUIRED]: (
    event: ExecutionEvent<InterventionRequiredPayload>,
  ) => void
  [ExecutionEventName.NODE_INTERVENTION_RESOLVED]: (
    event: ExecutionEvent<InterventionResolvedPayload>,
  ) => void
  [ExecutionEventName.NODE_TOOL_CALL_STATUS]: (
    event: ExecutionEvent<ToolCallStatusPayload>,
  ) => void
  [ExecutionEventName.NODE_TOOL_PERMISSION_REQUIRED]: (
    event: ExecutionEvent<ToolPermissionRequiredPayload>,
  ) => void
  [ExecutionEventName.NODE_TOOL_PERMISSION_RESOLVED]: (
    event: ExecutionEvent<ToolPermissionResolvedPayload>,
  ) => void
  'execution.state.snapshot': (snapshot: ExecutionStateSnapshot) => void
  error: (error: { message: string; code?: string }) => void
}

export interface SubscribeAck {
  status: 'subscribed' | 'error'
  error?: string
  currentState: ExecutionStateSnapshot | null
}

export interface ClientToServerEvents {
  'execution:subscribe': (
    payload: SubscribePayload,
    ack?: (response: SubscribeAck) => void,
  ) => void
  'execution:unsubscribe': (payload: UnsubscribePayload) => void
  /** @deprecated — 使用 execution:subscribe */
  subscribe: (
    payload: SubscribePayload,
    ack?: (response: SubscribeAck) => void,
  ) => void
  /** @deprecated — 使用 execution:unsubscribe */
  unsubscribe: (payload: UnsubscribePayload) => void
}
