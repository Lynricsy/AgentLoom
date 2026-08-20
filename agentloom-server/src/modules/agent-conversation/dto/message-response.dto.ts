import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import type { AgentMessage } from '../../../database/schema/agent-conversations.schema';
import type { ToolCallStatus } from '../../agent/types/tool-call-event.types';

const MessageToolCallStatusSwaggerSchema = z.enum([
  'pending',
  'awaiting_permission',
  'denied',
  'in_progress',
  'completed',
  'failed',
]);

const MessageToolCallTransitionSwaggerSchema = z.object({
  from: MessageToolCallStatusSwaggerSchema.optional(),
  to: MessageToolCallStatusSwaggerSchema,
  timestamp: z.string(),
  source: z.enum(['runtime', 'worker', 'user']),
});

const MessageToolPermissionRequestSwaggerSchema = z.object({
  description: z.string(),
  resourcePaths: z.array(z.string()).optional(),
  domain: z.string().optional(),
  category: z.string().optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  sourceLabel: z.string().optional(),
  targetType: z.string().optional(),
  targetLabel: z.string().optional(),
  approveEffect: z.string().optional(),
  denyEffect: z.string().optional(),
  // 工具权限请求的差异预览来自动态 JSONB。
  diffPreview: z.record(z.string(), z.unknown()).optional(),
  rememberable: z.boolean().optional(),
});

export const MessageToolCallSwaggerSchema = z.object({
  id: z.string(),
  tool: z.string(),
  // 工具参数与执行结果来自动态 JSONB，结构由具体工具决定。
  args: z.unknown().optional(),
  status: MessageToolCallStatusSwaggerSchema,
  result: z.unknown().optional(),
  error: z.string().optional(),
  transitions: z.array(MessageToolCallTransitionSwaggerSchema).optional(),
  permissionRequest: MessageToolPermissionRequestSwaggerSchema.optional(),
});

export const MessageToolResultSwaggerSchema = z.object({
  toolCallId: z.string().optional(),
  tool: z.string().optional(),
  status: MessageToolCallStatusSwaggerSchema.optional(),
  // 工具执行结果来自动态 JSONB，结构由具体工具决定。
  result: z.unknown().optional(),
  error: z.string().optional(),
});

export const MessageResponseSwaggerSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  contentType: z.enum([
    'text',
    'image',
    'file',
    'tool_call',
    'tool_result',
    'system',
  ]),
  content: z.string(),
  toolCalls: z.array(MessageToolCallSwaggerSchema).nullable(),
  toolResults: z.array(MessageToolResultSwaggerSchema).nullable(),
  // 消息元数据来自动态 JSONB，键和值由消息生产方决定。
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

export const MessageListMetaSwaggerSchema = z.object({
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalPages: z.number().int().min(0),
});

export const MessageListResponseSwaggerSchema = z.object({
  data: z.array(MessageResponseSwaggerSchema),
  meta: MessageListMetaSwaggerSchema,
});

export class MessageListResponseSwaggerDto extends createZodDto(
  MessageListResponseSwaggerSchema,
) {}

export type MessageToolCallDto = z.infer<typeof MessageToolCallSwaggerSchema>;
export type MessageToolResultDto = z.infer<
  typeof MessageToolResultSwaggerSchema
>;
export type MessageResponseDto = z.infer<typeof MessageResponseSwaggerSchema>;
export type MessageListResponseDto = z.infer<
  typeof MessageListResponseSwaggerSchema
>;

export function serializeMessage(row: AgentMessage): MessageResponseDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    contentType: row.contentType,
    content: row.content,
    toolCalls: serializeToolCalls(row.toolCalls),
    toolResults: serializeToolResults(row.toolResults),
    metadata: row.metadata ?? {},
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeToolCalls(
  value: AgentMessage['toolCalls'],
): MessageToolCallDto[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const serialized = value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const id = readString(entry.id) ?? readString(entry.toolCallId);
    if (!id) {
      return [];
    }

    const tool =
      readString(entry.tool) ?? readString(entry.name) ?? 'unknown_tool';

    return [
      {
        id,
        tool,
        ...(entry.args !== undefined ? { args: entry.args } : {}),
        status: readToolCallStatus(entry.status, entry.error, entry.result),
        ...(entry.result !== undefined ? { result: entry.result } : {}),
        ...(readString(entry.error) ? { error: readString(entry.error)! } : {}),
        ...(serializeTransitions(entry.transitions)
          ? { transitions: serializeTransitions(entry.transitions)! }
          : {}),
        ...(serializePermissionRequest(entry.permissionRequest)
          ? {
              permissionRequest: serializePermissionRequest(
                entry.permissionRequest,
              )!,
            }
          : {}),
      } satisfies MessageToolCallDto,
    ];
  });

  return serialized.length > 0 ? serialized : null;
}

function serializeToolResults(
  value: AgentMessage['toolResults'],
): MessageToolResultDto[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const serialized = value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    return [
      {
        ...(readString(entry.toolCallId)
          ? { toolCallId: readString(entry.toolCallId)! }
          : {}),
        ...(readString(entry.tool) ? { tool: readString(entry.tool)! } : {}),
        ...(readKnownToolCallStatus(entry.status)
          ? { status: readKnownToolCallStatus(entry.status)! }
          : {}),
        ...(entry.result !== undefined ? { result: entry.result } : {}),
        ...(readString(entry.error) ? { error: readString(entry.error)! } : {}),
      } satisfies MessageToolResultDto,
    ];
  });

  return serialized.length > 0 ? serialized : null;
}

function serializeTransitions(
  value: unknown,
): MessageToolCallDto['transitions'] {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const transitions = value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const to = readKnownToolCallStatus(entry.to);
    const timestamp = readString(entry.timestamp);
    const source =
      entry.source === 'runtime' ||
      entry.source === 'worker' ||
      entry.source === 'user'
        ? entry.source
        : undefined;

    if (!to || !timestamp || !source) {
      return [];
    }

    const from = readKnownToolCallStatus(entry.from);
    return [
      {
        ...(from ? { from } : {}),
        to,
        timestamp,
        source,
      } satisfies NonNullable<MessageToolCallDto['transitions']>[number],
    ];
  });

  return transitions.length > 0 ? transitions : undefined;
}

function serializePermissionRequest(
  value: unknown,
): MessageToolCallDto['permissionRequest'] {
  if (!isRecord(value)) {
    return undefined;
  }

  const description = readString(value.description);
  if (!description) {
    return undefined;
  }

  const resourcePaths = Array.isArray(value.resourcePaths)
    ? value.resourcePaths.filter(
        (item): item is string => typeof item === 'string' && item.length > 0,
      )
    : [];

  const domain = readString(value.domain);
  const category = readString(value.category);
  const riskLevel =
    value.riskLevel === 'low' ||
    value.riskLevel === 'medium' ||
    value.riskLevel === 'high'
      ? value.riskLevel
      : undefined;
  const sourceLabel = readString(value.sourceLabel);
  const targetType = readString(value.targetType);
  const targetLabel = readString(value.targetLabel);
  const approveEffect = readString(value.approveEffect);
  const denyEffect = readString(value.denyEffect);
  const diffPreview = isRecord(value.diffPreview)
    ? value.diffPreview
    : undefined;
  const rememberable =
    typeof value.rememberable === 'boolean' ? value.rememberable : undefined;

  return {
    description,
    ...(resourcePaths.length > 0 ? { resourcePaths } : {}),
    ...(domain ? { domain } : {}),
    ...(category ? { category } : {}),
    ...(riskLevel ? { riskLevel } : {}),
    ...(sourceLabel ? { sourceLabel } : {}),
    ...(targetType ? { targetType } : {}),
    ...(targetLabel ? { targetLabel } : {}),
    ...(approveEffect ? { approveEffect } : {}),
    ...(denyEffect ? { denyEffect } : {}),
    ...(diffPreview ? { diffPreview } : {}),
    ...(rememberable !== undefined ? { rememberable } : {}),
  };
}

function readToolCallStatus(
  value: unknown,
  error: unknown,
  result: unknown,
): ToolCallStatus {
  return (
    readKnownToolCallStatus(value) ??
    (error !== undefined
      ? 'failed'
      : result !== undefined
        ? 'completed'
        : 'pending')
  );
}

function readKnownToolCallStatus(value: unknown): ToolCallStatus | undefined {
  switch (value) {
    case 'pending':
    case 'awaiting_permission':
    case 'denied':
    case 'in_progress':
    case 'completed':
    case 'failed':
      return value;
    default:
      return undefined;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
