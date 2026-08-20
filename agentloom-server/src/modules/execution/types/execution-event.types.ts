/**
 * Socket 事件类型的唯一来源是 `@agentloom/contracts`。
 *
 * 本文件只做两件事：
 * 1. 原样 re-export 契约层类型，让既有 import 路径保持不变；
 * 2. 保留仅服务端使用的 socket 通道形状（订阅/ACK/Server-Client 事件签名）。
 *
 * 新增或修改 wire 字段必须先改 `agentloom-contracts`，不要在这里重新声明。
 */
export type {
  ExecutionResourceType,
  PreparationPhase,
  StructuredErrorDetail,
  ExecutionStatusChangedPayload,
  StepStatusChangedPayload,
  StepAgentEventPayload,
  StepRetryingPayload,
  OutputChunkPayload,
  InterventionDecision,
  InterventionCheckpointRecord,
  InterventionRequiredPayload,
  InterventionResolvedPayload,
  ToolCallStatusPayload,
  ToolPermissionRequiredPayload,
  ToolPermissionResolvedPayload,
  ExecutionEventPayloadMap,
  ExecutionEvent,
  StepSnapshot,
  ExecutionStateSnapshot,
} from '@agentloom/contracts';

export {
  EXECUTION_EVENT_NAMES,
  EXECUTION_EVENT_PAYLOAD_SCHEMAS,
  ExecutionEventEnvelopeSchema,
  ExecutionEventNameSchema,
  ExecutionStateSnapshotSchema,
  StepSnapshotSchema,
  parseExecutionEvent,
} from '@agentloom/contracts';

import type {
  ExecutionEvent,
  ExecutionEventName as ExecutionEventNameType,
  ExecutionStateSnapshot,
} from '@agentloom/contracts';

/**
 * 事件名常量表。契约层导出的是取值数组与 zod enum，
 * 服务端代码大量按语义键引用（`ExecutionEventName.STEP_STATUS_CHANGED`），
 * 因此在这里维持具名映射；取值必须与契约层一致。
 */
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
} as const satisfies Record<string, ExecutionEventNameType>;

export type ExecutionEventName =
  (typeof ExecutionEventName)[keyof typeof ExecutionEventName];

export type LegacyEventName =
  | 'step:status-changed'
  | 'step:agent-event'
  | 'step:retrying'
  | 'execution:running'
  | 'execution:completed'
  | 'execution:failed'
  | 'execution:paused'
  | 'execution:cancelled';

export const LEGACY_EVENT_MAP: Record<
  LegacyEventName,
  ExecutionEventNameType
> = {
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
