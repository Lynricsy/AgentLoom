import type { AgentEvent } from '../../agent/types/agent-event.types';

export const ExecutionEventName = {
  EXECUTION_STATUS_CHANGED: 'execution.status.changed',
  STEP_STATUS_CHANGED: 'execution.step.status-changed',
  STEP_AGENT_EVENT: 'execution.step.agent-event',
  STEP_RETRYING: 'execution.step.retrying',
  OUTPUT_CHUNK: 'execution.output.chunk',
} as const;

export type ExecutionEventName =
  (typeof ExecutionEventName)[keyof typeof ExecutionEventName];

export interface ExecutionStatusChangedPayload {
  readonly executionId: string;
  readonly status: string;
  readonly completedSteps?: number;
  readonly totalSteps?: number;
  readonly errorMessage?: string;
}

export interface StepStatusChangedPayload {
  readonly stepId: string;
  readonly nodeId: string;
  readonly from: string;
  readonly to: string;
}

export interface StepAgentEventPayload {
  readonly stepId: string;
  readonly event: AgentEvent;
}

export interface StepRetryingPayload {
  readonly stepId: string;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly errorMessage?: string;
}

export interface OutputChunkPayload {
  readonly stepId: string;
  readonly chunk: string;
  readonly index: number;
}

export interface ExecutionEventPayloadMap {
  [ExecutionEventName.EXECUTION_STATUS_CHANGED]: ExecutionStatusChangedPayload;
  [ExecutionEventName.STEP_STATUS_CHANGED]: StepStatusChangedPayload;
  [ExecutionEventName.STEP_AGENT_EVENT]: StepAgentEventPayload;
  [ExecutionEventName.STEP_RETRYING]: StepRetryingPayload;
  [ExecutionEventName.OUTPUT_CHUNK]: OutputChunkPayload;
}

export interface ExecutionEvent<
  T extends ExecutionEventName = ExecutionEventName,
> {
  /** Monotonically increasing per execution */
  readonly eventId: number;
  readonly event: T;
  readonly timestamp: string;
  readonly executionId: string;
  readonly tenantId: string;
  readonly data: ExecutionEventPayloadMap[T];
}

export interface StepSnapshot {
  readonly stepId: string;
  readonly nodeId: string;
  readonly status: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly errorMessage?: string;
}

export interface ExecutionStateSnapshot {
  readonly executionId: string;
  readonly status: string;
  readonly completedSteps: number;
  readonly totalSteps: number;
  readonly steps: StepSnapshot[];
  readonly snapshotAt: string;
  readonly lastEventId?: number;
}

export type LegacyEventName =
  | 'step:status-changed'
  | 'step:agent-event'
  | 'step:retrying'
  | 'execution:running'
  | 'execution:completed'
  | 'execution:failed'
  | 'execution:paused'
  | 'execution:cancelled';

export const LEGACY_EVENT_MAP: Record<LegacyEventName, ExecutionEventName> = {
  'step:status-changed': ExecutionEventName.STEP_STATUS_CHANGED,
  'step:agent-event': ExecutionEventName.STEP_AGENT_EVENT,
  'step:retrying': ExecutionEventName.STEP_RETRYING,
  'execution:running': ExecutionEventName.EXECUTION_STATUS_CHANGED,
  'execution:completed': ExecutionEventName.EXECUTION_STATUS_CHANGED,
  'execution:failed': ExecutionEventName.EXECUTION_STATUS_CHANGED,
  'execution:paused': ExecutionEventName.EXECUTION_STATUS_CHANGED,
  'execution:cancelled': ExecutionEventName.EXECUTION_STATUS_CHANGED,
};

export interface SubscribePayload {
  readonly tenantId: string;
  readonly executionId: string;
}

export interface UnsubscribePayload {
  readonly tenantId: string;
  readonly executionId: string;
}

export interface ClientToServerEvents {
  'execution:subscribe': (payload: SubscribePayload) => void;
  'execution:unsubscribe': (payload: UnsubscribePayload) => void;
  /** @deprecated 使用 'execution:subscribe' 替代 */
  subscribe: (payload: SubscribePayload) => void;
  /** @deprecated 使用 'execution:unsubscribe' 替代 */
  unsubscribe: (payload: UnsubscribePayload) => void;
}

export interface ServerToClientEvents {
  [ExecutionEventName.EXECUTION_STATUS_CHANGED]: (
    event: ExecutionEvent<typeof ExecutionEventName.EXECUTION_STATUS_CHANGED>,
  ) => void;
  [ExecutionEventName.STEP_STATUS_CHANGED]: (
    event: ExecutionEvent<typeof ExecutionEventName.STEP_STATUS_CHANGED>,
  ) => void;
  [ExecutionEventName.STEP_AGENT_EVENT]: (
    event: ExecutionEvent<typeof ExecutionEventName.STEP_AGENT_EVENT>,
  ) => void;
  [ExecutionEventName.STEP_RETRYING]: (
    event: ExecutionEvent<typeof ExecutionEventName.STEP_RETRYING>,
  ) => void;
  [ExecutionEventName.OUTPUT_CHUNK]: (
    event: ExecutionEvent<typeof ExecutionEventName.OUTPUT_CHUNK>,
  ) => void;
  'execution.state.snapshot': (snapshot: ExecutionStateSnapshot) => void;
  error: (error: { message: string; code?: string }) => void;
}

export interface SocketData {
  user: {
    sub: string;
    email: string;
    tenantId?: string;
    tenantRole?: string;
  };
}
