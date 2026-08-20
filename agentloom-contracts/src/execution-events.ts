import { z } from 'zod';

import {
  AgentEventSchema,
  EventToolPermissionRequestSchema,
  SubAgentEventEnvelopeSchema,
  ToolCallStatusSchema,
  ToolCallTransitionSourceSchema,
} from './agent-events';

/**
 * Socket.IO `/execution` 与 `/agent-conversation` namespace 的 wire 契约。
 *
 * 逐字段 zod 化 server canonical 定义
 * (`agentloom-server/src/modules/execution/types/execution-event.types.ts`)。
 * wire casing 为 camelCase —— 这是现状，不做转换。
 */

const JsonRecordSchema = z.record(z.string(), z.unknown());

export const EXECUTION_EVENT_NAMES = [
  'execution.status.changed',
  'execution.node.status-changed',
  'execution.node.agent-event',
  'execution.node.retrying',
  'execution.node.output-chunk',
  'execution.node.intervention-required',
  'execution.node.intervention-resolved',
  'execution.node.tool-call-status',
  'execution.node.tool-permission-required',
  'execution.node.tool-permission-resolved',
] as const;

export const ExecutionEventNameSchema = z.enum(EXECUTION_EVENT_NAMES);

export const ExecutionResourceTypeSchema = z.enum([
  'workflow',
  'conversation',
]);

export const PreparationPhaseSchema = z.enum([
  'queued',
  'preparing',
  'sandbox_creating',
  'agent_initializing',
  'running',
]);

export const StructuredErrorDetailSchema = z.object({
  message: z.string(),
  type: z.string().optional(),
  title: z.string().optional(),
  detail: z.string().optional(),
  nodeId: z.string().optional(),
  stack: z.string().optional(),
  errors: z
    .array(z.object({ field: z.string(), message: z.string() }))
    .readonly()
    .optional(),
  typeMismatch: z
    .object({
      sourcePortId: z.string().optional(),
      targetPortId: z.string().optional(),
      sourceType: z.string(),
      targetType: z.string(),
      sourceNodeId: z.string(),
      targetNodeId: z.string(),
      edgeId: z.string().optional(),
    })
    .optional(),
  attempts: z
    .array(
      z.object({
        attempt: z.number(),
        message: z.string(),
        timestamp: z.string(),
      }),
    )
    .readonly()
    .optional(),
});

export const ExecutionStatusChangedPayloadSchema = z.object({
  executionId: z.string(),
  status: z.string(),
  executionType: ExecutionResourceTypeSchema.optional(),
  completedSteps: z.number().optional(),
  totalSteps: z.number().optional(),
  errorMessage: z.string().optional(),
  phase: PreparationPhaseSchema.optional(),
  failedPhase: PreparationPhaseSchema.optional(),
  error: z.string().optional(),
  sandboxReused: z.boolean().optional(),
});

export const StepStatusChangedPayloadSchema = z.object({
  stepId: z.string(),
  nodeId: z.string(),
  from: z.string(),
  to: z.string(),
  executionType: ExecutionResourceTypeSchema.optional(),
  errorDetail: StructuredErrorDetailSchema.optional(),
  result: JsonRecordSchema.nullable().optional(),
  checkpointData: JsonRecordSchema.nullable().optional(),
});

export const StepAgentEventPayloadSchema = z.object({
  stepId: z.string(),
  executionType: ExecutionResourceTypeSchema.optional(),
  event: AgentEventSchema,
  subagent: SubAgentEventEnvelopeSchema.optional(),
});

export const StepRetryingPayloadSchema = z.object({
  stepId: z.string(),
  attempt: z.number(),
  maxAttempts: z.number(),
  errorMessage: z.string().optional(),
});

export const OutputChunkPayloadSchema = z.object({
  stepId: z.string(),
  chunk: z.string(),
  index: z.number(),
  executionType: ExecutionResourceTypeSchema.optional(),
});

export const InterventionDecisionSchema = z.object({
  suggestedContent: z.unknown().optional(),
  autonomyMode: z.string().optional(),
  selectedAction: z.string().optional(),
  alternatives: z.array(z.string()).readonly().optional(),
  confidence: z.number().optional(),
  rationale: z.string().optional(),
});

/** 检查点记录是持久化形状，键为 snake_case，与 Socket 信封的 camelCase 无关。 */
export const InterventionCheckpointRecordSchema = z.object({
  requested_at: z.string(),
  resolved_at: z.string(),
  action: z.enum(['approve', 'modify', 'reject']),
  instruction: z.unknown().nullable(),
  resolved_by_user_id: z.string(),
  timeout: z.boolean().optional(),
});

export const InterventionRequiredPayloadSchema = z.object({
  stepId: z.string(),
  nodeId: z.string(),
  nodeName: z.string(),
  executionType: ExecutionResourceTypeSchema.optional(),
  decision: InterventionDecisionSchema.optional(),
  partialContent: z.string().optional(),
  requestedAt: z.string(),
});

export const InterventionResolvedPayloadSchema = z.object({
  stepId: z.string(),
  nodeId: z.string(),
  executionType: ExecutionResourceTypeSchema.optional(),
  action: z.enum(['approve', 'modify', 'reject']),
  feedback: z.string().optional(),
  modifiedContent: z.unknown().optional(),
  resolvedBy: z.string(),
  resolvedAt: z.string(),
  timeout: z.boolean().optional(),
});

export const ToolCallStatusPayloadSchema = z.object({
  stepId: z.string(),
  nodeId: z.string(),
  toolCallId: z.string(),
  tool: z.string(),
  executionType: ExecutionResourceTypeSchema.optional(),
  status: ToolCallStatusSchema,
  args: JsonRecordSchema.optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  permissionRequest: EventToolPermissionRequestSchema.optional(),
  transitions: z
    .array(
      z.object({
        from: ToolCallStatusSchema.optional(),
        to: ToolCallStatusSchema,
        timestamp: z.string(),
        source: ToolCallTransitionSourceSchema,
      }),
    )
    .optional(),
});

export const ToolPermissionRequiredPayloadSchema = z.object({
  stepId: z.string(),
  nodeId: z.string(),
  toolCallId: z.string(),
  tool: z.string(),
  executionType: ExecutionResourceTypeSchema.optional(),
  args: JsonRecordSchema,
  requestedAt: z.string(),
  permissionRequest: EventToolPermissionRequestSchema.optional(),
});

export const ToolPermissionResolvedPayloadSchema = z.object({
  stepId: z.string(),
  nodeId: z.string(),
  toolCallId: z.string(),
  executionType: ExecutionResourceTypeSchema.optional(),
  action: z.enum(['approve', 'deny']),
});

export const EXECUTION_EVENT_PAYLOAD_SCHEMAS = {
  'execution.status.changed': ExecutionStatusChangedPayloadSchema,
  'execution.node.status-changed': StepStatusChangedPayloadSchema,
  'execution.node.agent-event': StepAgentEventPayloadSchema,
  'execution.node.retrying': StepRetryingPayloadSchema,
  'execution.node.output-chunk': OutputChunkPayloadSchema,
  'execution.node.intervention-required': InterventionRequiredPayloadSchema,
  'execution.node.intervention-resolved': InterventionResolvedPayloadSchema,
  'execution.node.tool-call-status': ToolCallStatusPayloadSchema,
  'execution.node.tool-permission-required':
    ToolPermissionRequiredPayloadSchema,
  'execution.node.tool-permission-resolved':
    ToolPermissionResolvedPayloadSchema,
} as const;

/**
 * 事件信封。`event` 与 `data` 的对应关系由
 * `EXECUTION_EVENT_PAYLOAD_SCHEMAS` 表达；本 schema 只校验信封骨架，
 * 需要按事件名精确校验载荷时用 {@link parseExecutionEvent}。
 */
export const ExecutionEventEnvelopeSchema = z.object({
  /** 每个 execution 内单调递增 */
  eventId: z.number(),
  event: ExecutionEventNameSchema,
  timestamp: z.string(),
  executionId: z.string(),
  tenantId: z.string(),
  data: z.unknown(),
});

/**
 * 字段集以 `StateReplayService.getExecutionSnapshot()` 的构造结果为准：
 * `result` / `checkpointData` 恒被写入（缺值为 null），
 * `errorMessage` / `errorDetail` 只在有错误时条件展开。
 */
export const StepSnapshotSchema = z.object({
  stepId: z.string(),
  nodeId: z.string(),
  status: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  errorMessage: z.string().optional(),
  errorDetail: StructuredErrorDetailSchema.optional(),
  result: JsonRecordSchema.nullable(),
  checkpointData: JsonRecordSchema.nullable(),
});

export const ExecutionStateSnapshotSchema = z.object({
  executionId: z.string(),
  status: z.string(),
  completedSteps: z.number(),
  totalSteps: z.number(),
  steps: z.array(StepSnapshotSchema),
  snapshotAt: z.string(),
  /** 构造器恒写入，缺值为 0 */
  lastEventId: z.number(),
});

export type ExecutionEventName = z.infer<typeof ExecutionEventNameSchema>;
export type ExecutionResourceType = z.infer<
  typeof ExecutionResourceTypeSchema
>;
export type PreparationPhase = z.infer<typeof PreparationPhaseSchema>;
export type StructuredErrorDetail = z.infer<
  typeof StructuredErrorDetailSchema
>;
export type ExecutionStatusChangedPayload = z.infer<
  typeof ExecutionStatusChangedPayloadSchema
>;
export type StepStatusChangedPayload = z.infer<
  typeof StepStatusChangedPayloadSchema
>;
export type StepAgentEventPayload = z.infer<
  typeof StepAgentEventPayloadSchema
>;
export type StepRetryingPayload = z.infer<typeof StepRetryingPayloadSchema>;
export type OutputChunkPayload = z.infer<typeof OutputChunkPayloadSchema>;
export type InterventionDecision = z.infer<typeof InterventionDecisionSchema>;
export type InterventionCheckpointRecord = z.infer<
  typeof InterventionCheckpointRecordSchema
>;
export type InterventionRequiredPayload = z.infer<
  typeof InterventionRequiredPayloadSchema
>;
export type InterventionResolvedPayload = z.infer<
  typeof InterventionResolvedPayloadSchema
>;
export type ToolCallStatusPayload = z.infer<
  typeof ToolCallStatusPayloadSchema
>;
export type ToolPermissionRequiredPayload = z.infer<
  typeof ToolPermissionRequiredPayloadSchema
>;
export type ToolPermissionResolvedPayload = z.infer<
  typeof ToolPermissionResolvedPayloadSchema
>;
export type StepSnapshot = z.infer<typeof StepSnapshotSchema>;
export type ExecutionStateSnapshot = z.infer<
  typeof ExecutionStateSnapshotSchema
>;

export interface ExecutionEventPayloadMap {
  'execution.status.changed': ExecutionStatusChangedPayload;
  'execution.node.status-changed': StepStatusChangedPayload;
  'execution.node.agent-event': StepAgentEventPayload;
  'execution.node.retrying': StepRetryingPayload;
  'execution.node.output-chunk': OutputChunkPayload;
  'execution.node.intervention-required': InterventionRequiredPayload;
  'execution.node.intervention-resolved': InterventionResolvedPayload;
  'execution.node.tool-call-status': ToolCallStatusPayload;
  'execution.node.tool-permission-required': ToolPermissionRequiredPayload;
  'execution.node.tool-permission-resolved': ToolPermissionResolvedPayload;
}

export interface ExecutionEvent<
  T extends ExecutionEventName = ExecutionEventName,
> {
  /** 每个 execution 内单调递增 */
  readonly eventId: number;
  readonly event: T;
  readonly timestamp: string;
  readonly executionId: string;
  readonly tenantId: string;
  readonly data: ExecutionEventPayloadMap[T];
}

/**
 * 按事件名精确校验整个信封（骨架 + 对应载荷）。
 * 事件名未知或载荷不符时抛出 zod 错误。
 */
export function parseExecutionEvent(input: unknown): ExecutionEvent {
  const envelope = ExecutionEventEnvelopeSchema.parse(input);
  const payloadSchema = EXECUTION_EVENT_PAYLOAD_SCHEMAS[envelope.event];
  return {
    ...envelope,
    data: payloadSchema.parse(envelope.data),
  } as ExecutionEvent;
}
