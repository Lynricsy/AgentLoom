import type { AgentEvent } from '../../agent/types/agent-event.types';
import type { ToolCallStatus } from '../../agent/types/tool-call-event.types';

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
} as const;

export type ExecutionEventName =
  (typeof ExecutionEventName)[keyof typeof ExecutionEventName];

export type ExecutionResourceType = 'workflow' | 'conversation';

/**
 * Preparation phases for agent conversation sandbox startup.
 * Clients that do not recognise the `phase` field can safely ignore it.
 */
export type PreparationPhase =
  | 'queued'
  | 'preparing'
  | 'sandbox_creating'
  | 'agent_initializing'
  | 'running';

export interface ExecutionStatusChangedPayload {
  readonly executionId: string;
  readonly status: string;
  readonly executionType?: ExecutionResourceType;
  readonly completedSteps?: number;
  readonly totalSteps?: number;
  readonly errorMessage?: string;

  /** Current preparation phase during agent conversation startup. */
  readonly phase?: PreparationPhase;
  /** When a failure occurs, identifies which phase failed. */
  readonly failedPhase?: PreparationPhase;
  /** Human-readable error summary (used alongside failedPhase). */
  readonly error?: string;
  /** True when an existing sandbox session was reused instead of created. */
  readonly sandboxReused?: boolean;
}

export interface StructuredErrorDetail {
  readonly message: string;
  readonly type?: string;
  readonly title?: string;
  readonly detail?: string;
  readonly nodeId?: string;
  readonly stack?: string;
  readonly errors?: ReadonlyArray<{
    readonly field: string;
    readonly message: string;
  }>;
  readonly typeMismatch?: {
    readonly sourcePortId?: string;
    readonly targetPortId?: string;
    readonly sourceType: string;
    readonly targetType: string;
    readonly sourceNodeId: string;
    readonly targetNodeId: string;
    readonly edgeId?: string;
  };
  readonly attempts?: ReadonlyArray<{
    readonly attempt: number;
    readonly message: string;
    readonly timestamp: string;
  }>;
}

export interface StepStatusChangedPayload {
  readonly stepId: string;
  readonly nodeId: string;
  readonly from: string;
  readonly to: string;
  readonly executionType?: ExecutionResourceType;
  readonly errorDetail?: StructuredErrorDetail;
}

export interface StepAgentEventPayload {
  readonly stepId: string;
  readonly executionType?: ExecutionResourceType;
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
  readonly executionType?: 'workflow' | 'conversation';
}

export interface InterventionDecision {
  readonly suggestedContent?: unknown;
  readonly autonomyMode?: string;
  readonly selectedAction?: string;
  readonly alternatives?: readonly string[];
  readonly confidence?: number;
  readonly rationale?: string;
}

export interface InterventionCheckpointRecord {
  readonly requested_at: string;
  readonly resolved_at: string;
  readonly action: 'approve' | 'modify' | 'reject';
  readonly instruction: unknown | null;
  readonly resolved_by_user_id: string;
  readonly timeout?: boolean;
}

export interface InterventionRequiredPayload {
  readonly stepId: string;
  readonly nodeId: string;
  readonly nodeName: string;
  readonly executionType?: ExecutionResourceType;
  readonly decision?: InterventionDecision;
  readonly partialContent?: string;
  readonly requestedAt: string;
}

export interface InterventionResolvedPayload {
  readonly stepId: string;
  readonly nodeId: string;
  readonly executionType?: ExecutionResourceType;
  readonly action: 'approve' | 'modify' | 'reject';
  readonly feedback?: string;
  readonly modifiedContent?: unknown;
  readonly resolvedBy: string;
  readonly resolvedAt: string;
  readonly timeout?: boolean;
}

export interface ToolCallStatusPayload {
  readonly stepId: string;
  readonly nodeId: string;
  readonly toolCallId: string;
  readonly tool: string;
  readonly executionType?: ExecutionResourceType;
  readonly status: ToolCallStatus;
  readonly args?: Record<string, unknown>;
  readonly result?: unknown;
  readonly error?: string;
  readonly transitions?: Array<{
    readonly from?: ToolCallStatus;
    readonly to: ToolCallStatus;
    readonly timestamp: string;
    readonly source: 'runtime' | 'worker' | 'user';
  }>;
}

export interface ToolPermissionRequiredPayload {
  readonly stepId: string;
  readonly nodeId: string;
  readonly toolCallId: string;
  readonly tool: string;
  readonly executionType?: ExecutionResourceType;
  readonly args: Record<string, unknown>;
  readonly requestedAt: string;
  readonly permissionRequest?: {
    readonly description?: string;
    readonly resourcePaths?: readonly string[];
  };
}

export interface ToolPermissionResolvedPayload {
  readonly stepId: string;
  readonly nodeId: string;
  readonly toolCallId: string;
  readonly executionType?: ExecutionResourceType;
  readonly action: 'approve' | 'deny';
}

export interface ExecutionEventPayloadMap {
  [ExecutionEventName.EXECUTION_STATUS_CHANGED]: ExecutionStatusChangedPayload;
  [ExecutionEventName.STEP_STATUS_CHANGED]: StepStatusChangedPayload;
  [ExecutionEventName.STEP_AGENT_EVENT]: StepAgentEventPayload;
  [ExecutionEventName.STEP_RETRYING]: StepRetryingPayload;
  [ExecutionEventName.OUTPUT_CHUNK]: OutputChunkPayload;
  [ExecutionEventName.NODE_INTERVENTION_REQUIRED]: InterventionRequiredPayload;
  [ExecutionEventName.NODE_INTERVENTION_RESOLVED]: InterventionResolvedPayload;
  [ExecutionEventName.NODE_TOOL_CALL_STATUS]: ToolCallStatusPayload;
  [ExecutionEventName.NODE_TOOL_PERMISSION_REQUIRED]: ToolPermissionRequiredPayload;
  [ExecutionEventName.NODE_TOOL_PERMISSION_RESOLVED]: ToolPermissionResolvedPayload;
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
  readonly errorDetail?: StructuredErrorDetail;
  readonly result?: Record<string, unknown> | null;
  readonly checkpointData?: Record<string, unknown> | null;
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
  readonly lastEventId?: number;
}

export interface UnsubscribePayload {
  readonly tenantId: string;
  readonly executionId: string;
}

export interface SubscribeAck {
  status: 'subscribed' | 'error';
  error?: string;
  currentState: ExecutionStateSnapshot | null;
}

export interface ClientToServerEvents {
  'execution:subscribe': (
    payload: SubscribePayload,
    ack?: (response: SubscribeAck) => void,
  ) => void;
  'execution:unsubscribe': (payload: UnsubscribePayload) => void;
  /** @deprecated 使用 'execution:subscribe' 替代 */
  subscribe: (
    payload: SubscribePayload,
    ack?: (response: SubscribeAck) => void,
  ) => void;
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
  [ExecutionEventName.NODE_INTERVENTION_REQUIRED]: (
    event: ExecutionEvent<typeof ExecutionEventName.NODE_INTERVENTION_REQUIRED>,
  ) => void;
  [ExecutionEventName.NODE_INTERVENTION_RESOLVED]: (
    event: ExecutionEvent<typeof ExecutionEventName.NODE_INTERVENTION_RESOLVED>,
  ) => void;
  [ExecutionEventName.NODE_TOOL_CALL_STATUS]: (
    event: ExecutionEvent<typeof ExecutionEventName.NODE_TOOL_CALL_STATUS>,
  ) => void;
  [ExecutionEventName.NODE_TOOL_PERMISSION_REQUIRED]: (
    event: ExecutionEvent<
      typeof ExecutionEventName.NODE_TOOL_PERMISSION_REQUIRED
    >,
  ) => void;
  [ExecutionEventName.NODE_TOOL_PERMISSION_RESOLVED]: (
    event: ExecutionEvent<
      typeof ExecutionEventName.NODE_TOOL_PERMISSION_RESOLVED
    >,
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
