// 客户端执行事件类型 — 与服务端 execution-event.types.ts 保持对齐

export const ExecutionEventName = {
  EXECUTION_STATUS_CHANGED: 'execution.status.changed',
  STEP_STATUS_CHANGED: 'execution.step.status-changed',
  STEP_AGENT_EVENT: 'execution.step.agent-event',
  STEP_RETRYING: 'execution.step.retrying',
  OUTPUT_CHUNK: 'execution.output.chunk',
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

export interface StepStatusChangedPayload {
  stepId: string
  nodeId: string
  from: StepStatus
  to: StepStatus
}

export interface StepAgentEventPayload {
  stepId: string
  event: unknown // AgentEvent — 前端不需要完整类型
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
  'execution.state.snapshot': (snapshot: ExecutionStateSnapshot) => void
  error: (error: { message: string; code?: string }) => void
}

export interface ClientToServerEvents {
  subscribe: (payload: SubscribePayload) => void
  unsubscribe: (payload: UnsubscribePayload) => void
}
