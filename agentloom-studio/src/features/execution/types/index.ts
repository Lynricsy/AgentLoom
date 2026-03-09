import type { ExecutionResponse } from '../api/executionApi'

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

export interface ExecutionStep {
  id: string
  executionId: string
  nodeId: string
  nodeName: string
  nodeType: string
  status: ExecutionStepStatus
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  errorMessage: string | null
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

export interface ExecutionDetail extends ExecutionResponse {
  steps: ExecutionStep[]
  workflowVersion: {
    id: string
    graph: ExecutionWorkflowGraph
  }
}
