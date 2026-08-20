import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import type { AgentConversation } from '../../../database/schema/agent-conversations.schema';
import { MessageListResponseSwaggerSchema } from './message-response.dto';

export const ConversationResponseSwaggerSchema = z.object({
  id: z.string().uuid(),
  agentDefinitionId: z.string().uuid(),
  title: z.string().nullable(),
  status: z.enum(['active', 'paused', 'ended', 'failed']),
  // 对话元数据来自动态 JSONB，键和值由运行时写入方决定。
  metadata: z.record(z.string(), z.unknown()),
  createdBy: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ConversationListMetaSwaggerSchema = z.object({
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalPages: z.number().int().min(0),
});

export const ConversationListResponseSwaggerSchema = z.object({
  data: z.array(ConversationResponseSwaggerSchema),
  meta: ConversationListMetaSwaggerSchema,
});

export const ConversationDetailResponseSwaggerSchema = z.object({
  data: ConversationResponseSwaggerSchema.extend({
    messages: MessageListResponseSwaggerSchema,
  }),
});

export class ConversationListResponseSwaggerDto extends createZodDto(
  ConversationListResponseSwaggerSchema,
) {}

export class ConversationDetailResponseSwaggerDto extends createZodDto(
  ConversationDetailResponseSwaggerSchema,
) {}

export type ConversationResponseDto = z.infer<
  typeof ConversationResponseSwaggerSchema
>;
export type ConversationListResponseDto = z.infer<
  typeof ConversationListResponseSwaggerSchema
>;
export type ConversationDetailResponseDto = z.infer<
  typeof ConversationDetailResponseSwaggerSchema
>;

export function serializeConversation(
  row: AgentConversation,
): ConversationResponseDto {
  return {
    id: row.id,
    agentDefinitionId: row.agentDefinitionId,
    title: row.title ?? null,
    status: row.status,
    metadata: row.metadata ?? {},
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
