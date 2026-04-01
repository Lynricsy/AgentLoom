import type {
  ExecutionResponse,
  ExecutionStepErrorResponse,
} from '../api/executionApi'

export interface TypeMismatchInfo {
  sourcePortId?: string
  targetPortId?: string
  sourceType: string
  targetType: string
  sourceNodeId: string
  targetNodeId: string
  edgeId?: string
}

export type {
  ClientToServerEvents,
  ExecutionEvent,
  ExecutionStateSnapshot,
  ExecutionStatus,
  ExecutionStatusChangedPayload,
  InterventionRequiredPayload,
  InterventionResolvedPayload,
  OutputChunkPayload,
  ServerToClientEvents,
  StructuredErrorDetail,
  StepAgentEventPayload,
  StepRetryingPayload,
  StepSnapshot,
  StepStatus,
  StepStatusChangedPayload,
  SubscribeAck,
  SubscribePayload,
  UnsubscribePayload,
} from './execution-event.types'

export { ExecutionEventName } from './execution-event.types'

export type {
  AgentEvent,
  AgentEventType,
  DecisionEvent,
  DoneEvent,
  FileChangeEvent,
  MessageChunkEvent,
  PlanEvent,
  StopReason,
  ToolCallAgentEvent,
  ToolCallEventData,
  ToolCallStatus,
  ToolCallStatusPayload,
  ToolPermissionRequiredPayload,
  ToolPermissionResolvedPayload,
} from './agentEvent.types'

export type {
  PtyBufferDumpResponse,
  PtyEvent,
  PtyExitEvent,
  PtyKilledEvent,
  PtyOutputEvent,
  PtySessionInfo,
  PtySessionState,
  PtySessionStatus,
  PtySpawnedEvent,
  PtyWriteResponse,
} from './pty'

export type ExecutionStepStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'waiting_for_intervention'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled'

export interface ExecutionStepAttempt {
  attempt: number
  error: string
  timestamp: string
}

export type ExecutionStepErrorDetail = ExecutionStepErrorResponse

export interface ExecutionStep {
  id: string
  executionId: string
  nodeId: string
  nodeName: string
  nodeType: string
  status: ExecutionStepStatus
  input: Record<string, unknown> | null
  nodeData?: Record<string, unknown> | null
  output: Record<string, unknown> | null
  errorMessage: string | null
  errorDetail?: ExecutionStepErrorDetail | null
  startedAt: string | null
  completedAt: string | null
  retryCount: number
  retryHistory?: ExecutionStepAttempt[]
  checkpointData?: Record<string, unknown> | null
  stepOrder?: number
}

export interface ExecutionWorkflowGraph {
  nodes: unknown[]
  edges: unknown[]
}

export interface ExecutionDetail
  extends Omit<ExecutionResponse, 'steps' | 'workflowVersion'> {
  steps: ExecutionStep[]
  workflowVersion: {
    id: string
    graph: ExecutionWorkflowGraph
  }
}
