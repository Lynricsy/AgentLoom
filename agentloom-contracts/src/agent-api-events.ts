import { z } from 'zod';

/**
 * Agent 对外 API（`/api/v1/agent-api/**`）的 run 资源与 SSE 事件 wire 契约。
 *
 * - 服务端：执行进程把事件映射为本文件定义的形状后写入 Redis Stream，HTTP 进程原样转发为 SSE 帧；
 *   SSE 的 `event:` 行等于下面的 `event` 字段，`data:` 行是 `data` 字段的 JSON。
 * - 第三方：必须忽略未知 `event`，v1 内只做加法。
 * - 与 `docs/design/agent-external-api.openapi.yaml` 的 `Run` / `RunStreamEvent` 一一对应。
 */

export const AGENT_API_RUN_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const;

export const AgentApiRunStatusSchema = z.enum(AGENT_API_RUN_STATUSES);
export type AgentApiRunStatus = z.infer<typeof AgentApiRunStatusSchema>;

export const AGENT_API_TERMINAL_RUN_STATUSES = [
  'completed',
  'failed',
  'cancelled',
] as const satisfies readonly AgentApiRunStatus[];

export const AgentApiToolCallStatusSchema = z.enum([
  'pending',
  'awaiting_permission',
  'denied',
  'in_progress',
  'completed',
  'failed',
]);

export const AgentApiToolCallSummarySchema = z.object({
  id: z.string(),
  tool: z.string(),
  status: AgentApiToolCallStatusSchema,
});
export type AgentApiToolCallSummary = z.infer<
  typeof AgentApiToolCallSummarySchema
>;

export const AgentApiRunErrorSchema = z.object({
  type: z.string(),
  title: z.string(),
  detail: z.string().optional(),
});
export type AgentApiRunError = z.infer<typeof AgentApiRunErrorSchema>;

export const AgentApiRunSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  status: AgentApiRunStatusSchema,
  agentVersionId: z.uuid().nullable(),
  input: z.object({
    messageId: z.uuid(),
    content: z.string(),
  }),
  output: z
    .object({
      messageId: z.uuid(),
      content: z.string(),
      toolCalls: z.array(AgentApiToolCallSummarySchema),
    })
    .nullable(),
  stopReason: z.enum(['end_turn', 'max_tokens', 'cancelled']).nullable(),
  error: AgentApiRunErrorSchema.nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type AgentApiRun = z.infer<typeof AgentApiRunSchema>;

export const AGENT_API_RUN_PHASES = [
  'queued',
  'preparing',
  'sandbox_creating',
  'agent_initializing',
  'running',
] as const;

export const AgentApiRunCreatedEventSchema = z.object({
  event: z.literal('run.created'),
  data: z.object({ run: AgentApiRunSchema }),
});

export const AgentApiRunStatusEventSchema = z.object({
  event: z.literal('run.status'),
  data: z.object({
    runId: z.uuid(),
    status: z.enum(['queued', 'running']),
    phase: z.enum(AGENT_API_RUN_PHASES).optional(),
  }),
});

export const AgentApiMessageDeltaEventSchema = z.object({
  event: z.literal('message.delta'),
  data: z.object({
    runId: z.uuid(),
    index: z.number().int().nonnegative(),
    delta: z.string(),
  }),
});

/** 不携带 args/result：避免把内部工具参数与结果泄露给第三方，需要时读消息。 */
export const AgentApiToolCallEventSchema = z.object({
  event: z.literal('tool_call'),
  data: z.object({
    runId: z.uuid(),
    toolCallId: z.string(),
    tool: z.string(),
    status: AgentApiToolCallStatusSchema,
    error: z.string().optional(),
  }),
});

export const AgentApiRunTerminalEventSchema = z.object({
  event: z.enum(['run.completed', 'run.failed', 'run.cancelled']),
  data: z.object({ run: AgentApiRunSchema }),
});

export const AgentApiStreamEventSchema = z.union([
  AgentApiRunCreatedEventSchema,
  AgentApiRunStatusEventSchema,
  AgentApiMessageDeltaEventSchema,
  AgentApiToolCallEventSchema,
  AgentApiRunTerminalEventSchema,
]);
export type AgentApiStreamEvent = z.infer<typeof AgentApiStreamEventSchema>;

export const AGENT_API_STREAM_EVENT_NAMES = [
  'run.created',
  'run.status',
  'message.delta',
  'tool_call',
  'run.completed',
  'run.failed',
  'run.cancelled',
] as const satisfies readonly AgentApiStreamEvent['event'][];
