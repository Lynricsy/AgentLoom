import { z } from 'zod';

/**
 * Agent 运行时事件。
 *
 * 逐字段 zod 化 server canonical 定义：
 * - `agentloom-server/src/modules/agent/types/agent-event.types.ts`
 * - `agentloom-server/src/modules/agent/types/tool-call-event.types.ts`
 * - `agentloom-server/src/modules/agent-execution/subagent/subagent-execution.types.ts`
 */

const JsonRecordSchema = z.record(z.string(), z.unknown());

export const STOP_REASONS = [
  'end_turn',
  'max_tokens',
  'tool_use',
  'cancelled',
  'intervention_required',
] as const;

export const StopReasonSchema = z.enum(STOP_REASONS);

export const TOOL_CALL_STATUSES = [
  'pending',
  'awaiting_permission',
  'denied',
  'in_progress',
  'completed',
  'failed',
] as const;

export const ToolCallStatusSchema = z.enum(TOOL_CALL_STATUSES);

export const ToolCallTransitionSourceSchema = z.enum([
  'runtime',
  'worker',
  'user',
]);

export const ToolCallTransitionRecordSchema = z.object({
  from: ToolCallStatusSchema.optional(),
  to: ToolCallStatusSchema,
  timestamp: z.string(),
  source: ToolCallTransitionSourceSchema,
});

export const ToolPermissionRiskLevelSchema = z.enum(['low', 'medium', 'high']);

/**
 * `ToolPermissionRequest` 的 `description` 在 canonical 定义中必填，
 * 但事件载荷内嵌的 `permissionRequest` 把它声明为可选，两者形状不同，
 * 因此分别导出。
 */
export const ToolPermissionRequestSchema = z.object({
  description: z.string(),
  resourcePaths: z.array(z.string()).readonly().optional(),
  domain: z.string().optional(),
  category: z.string().optional(),
  riskLevel: ToolPermissionRiskLevelSchema.optional(),
  sourceLabel: z.string().optional(),
  targetType: z.string().optional(),
  targetLabel: z.string().optional(),
  approveEffect: z.string().optional(),
  denyEffect: z.string().optional(),
  diffPreview: JsonRecordSchema.optional(),
  rememberable: z.boolean().optional(),
});

export const EventToolPermissionRequestSchema =
  ToolPermissionRequestSchema.extend({
    description: z.string().optional(),
  });

export const ToolCallEventSchema = z.object({
  id: z.string(),
  tool: z.string(),
  args: JsonRecordSchema,
  status: ToolCallStatusSchema,
  transitions: z.array(ToolCallTransitionRecordSchema).readonly().optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  permissionRequest: ToolPermissionRequestSchema.optional(),
});

export const PlanEventSchema = z.object({
  type: z.literal('plan'),
  title: z.string(),
  content: z.string(),
});

export const MessageChunkEventSchema = z.object({
  type: z.literal('message_chunk'),
  content: z.string(),
});

export const ToolCallAgentEventSchema = z.object({
  type: z.literal('tool_call'),
  call: ToolCallEventSchema,
});

export const DecisionEventSchema = z.object({
  type: z.literal('decision'),
  suggestedContent: z.string(),
  autonomyMode: z.string().optional(),
  selectedAction: z.string().optional(),
  alternatives: z.array(z.string()).readonly().optional(),
  confidence: z.number().optional(),
  rationale: z.string().optional(),
});

export const DoneEventSchema = z.object({
  type: z.literal('done'),
  stopReason: StopReasonSchema,
});

export const FileChangeEventSchema = z.object({
  type: z.literal('file_change'),
  path: z.string(),
  changeType: z.enum(['created', 'modified', 'deleted']),
  diff: z.string().optional(),
  content: z.string().optional(),
});

export const PtySessionInfoSchema = z.object({
  id: z.string(),
  pid: z.number(),
  command: z.string(),
  args: z.array(z.string()).readonly(),
  cwd: z.string(),
  status: z.enum(['running', 'killing', 'killed', 'exited']),
  exitCode: z.number().optional(),
  exitSignal: z.union([z.number(), z.string()]).optional(),
  createdAt: z.string(),
  lastActivityAt: z.string(),
  title: z.string().optional(),
  notifyOnExit: z.boolean(),
  cols: z.number(),
  rows: z.number(),
  lineCount: z.number(),
});

export const PtySpawnedEventSchema = z.object({
  type: z.literal('pty.spawned'),
  sessionId: z.string(),
  info: PtySessionInfoSchema,
});

export const PtyOutputEventSchema = z.object({
  type: z.literal('pty.output'),
  sessionId: z.string(),
  data: z.string(),
});

export const PtyExitEventSchema = z.object({
  type: z.literal('pty.exit'),
  sessionId: z.string(),
  exitCode: z.number().optional(),
  exitSignal: z.union([z.number(), z.string()]).optional(),
});

export const PtyKilledEventSchema = z.object({
  type: z.literal('pty.killed'),
  sessionId: z.string(),
});

export const AgentEventSchema = z.discriminatedUnion('type', [
  PlanEventSchema,
  MessageChunkEventSchema,
  ToolCallAgentEventSchema,
  DecisionEventSchema,
  DoneEventSchema,
  FileChangeEventSchema,
  PtySpawnedEventSchema,
  PtyOutputEventSchema,
  PtyExitEventSchema,
  PtyKilledEventSchema,
]);

export const SUB_AGENT_RUN_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'timeout',
  'cancelled',
] as const;

export const SubAgentRunStatusSchema = z.enum(SUB_AGENT_RUN_STATUSES);

/** 子代理句柄形如 `sa_` + 12 位十六进制字符。 */
export const SubAgentHandleSchema = z.string().regex(/^sa_[0-9a-f]{12}$/);

export const SubAgentEventEnvelopeSchema = z.object({
  handle: SubAgentHandleSchema,
  alias: z.string(),
  depth: z.number().int(),
  parentToolCallId: z.string(),
});

export type StopReason = z.infer<typeof StopReasonSchema>;
export type ToolCallStatus = z.infer<typeof ToolCallStatusSchema>;
export type ToolCallTransitionSource = z.infer<
  typeof ToolCallTransitionSourceSchema
>;
export type ToolCallTransitionRecord = z.infer<
  typeof ToolCallTransitionRecordSchema
>;
export type ToolPermissionRequest = z.infer<typeof ToolPermissionRequestSchema>;
export type EventToolPermissionRequest = z.infer<
  typeof EventToolPermissionRequestSchema
>;
export type ToolCallEvent = z.infer<typeof ToolCallEventSchema>;
export type PlanEvent = z.infer<typeof PlanEventSchema>;
export type MessageChunkEvent = z.infer<typeof MessageChunkEventSchema>;
export type ToolCallAgentEvent = z.infer<typeof ToolCallAgentEventSchema>;
export type DecisionEvent = z.infer<typeof DecisionEventSchema>;
export type DoneEvent = z.infer<typeof DoneEventSchema>;
export type FileChangeEvent = z.infer<typeof FileChangeEventSchema>;
export type PtySessionInfo = z.infer<typeof PtySessionInfoSchema>;
export type PtySpawnedEvent = z.infer<typeof PtySpawnedEventSchema>;
export type PtyOutputEvent = z.infer<typeof PtyOutputEventSchema>;
export type PtyExitEvent = z.infer<typeof PtyExitEventSchema>;
export type PtyKilledEvent = z.infer<typeof PtyKilledEventSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type SubAgentRunStatus = z.infer<typeof SubAgentRunStatusSchema>;
export type SubAgentHandle = z.infer<typeof SubAgentHandleSchema>;
export type SubAgentEventEnvelope = z.infer<
  typeof SubAgentEventEnvelopeSchema
>;
