import {
  AgentApiRunSchema,
  AgentApiToolCallSummarySchema,
} from '@agentloom/contracts';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { AGENT_API_CONVERSATION_STATUSES } from './agent-api-request.dto';

/** 对外接口响应形状，字段与 OpenAPI `Conversation` / `Message` / `Run` / `BoundAgent` 一致 */

const IsoDatetimeSchema = z.iso.datetime({ offset: true });

export const AgentApiPageMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  total: z.number().int().min(0),
});

export type AgentApiPageMeta = z.infer<typeof AgentApiPageMetaSchema>;

export const AgentApiConversationSchema = z.object({
  id: z.uuid(),
  title: z.string().nullable(),
  status: z.enum(AGENT_API_CONVERSATION_STATUSES),
  externalUserId: z.string().nullable(),
  // 调用方写入的对话元数据，平台不解释
  metadata: z.record(z.string(), z.unknown()),
  createdAt: IsoDatetimeSchema,
  updatedAt: IsoDatetimeSchema,
});

export type AgentApiConversation = z.infer<typeof AgentApiConversationSchema>;

export const AgentApiMessageSchema = z.object({
  id: z.uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  /** 只回传元数据，不回传 dataBase64/textContent */
  attachments: z.array(
    z.object({
      kind: z.enum(['image', 'file']),
      fileName: z.string(),
      mimeType: z.string(),
      sizeBytes: z.number().int(),
    }),
  ),
  toolCalls: z.array(AgentApiToolCallSummarySchema),
  createdAt: IsoDatetimeSchema,
});

export type AgentApiMessage = z.infer<typeof AgentApiMessageSchema>;

export const AgentApiBoundAgentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(['draft', 'published', 'archived']),
  publishedVersion: z
    .object({
      id: z.uuid(),
      label: z.string().nullable(),
      publishedAt: IsoDatetimeSchema,
    })
    .nullable(),
  /** Agent 定义上的 inputSchema（JSON Schema），未配置为 null；v1 仅用于展示 */
  inputSchema: z.record(z.string(), z.unknown()).nullable(),
});

export type AgentApiBoundAgent = z.infer<typeof AgentApiBoundAgentSchema>;

export class AgentApiBoundAgentEnvelopeSwaggerDto extends createZodDto(
  z.object({ data: AgentApiBoundAgentSchema }),
) {}

export class AgentApiConversationEnvelopeSwaggerDto extends createZodDto(
  z.object({ data: AgentApiConversationSchema }),
) {}

export class AgentApiConversationListSwaggerDto extends createZodDto(
  z.object({
    data: z.array(AgentApiConversationSchema),
    meta: AgentApiPageMetaSchema,
  }),
) {}

export class AgentApiMessageListSwaggerDto extends createZodDto(
  z.object({
    data: z.array(AgentApiMessageSchema),
    meta: AgentApiPageMetaSchema,
  }),
) {}

export class AgentApiRunEnvelopeSwaggerDto extends createZodDto(
  z.object({ data: AgentApiRunSchema }),
) {}

export class AgentApiRunListSwaggerDto extends createZodDto(
  z.object({
    data: z.array(AgentApiRunSchema),
    meta: AgentApiPageMetaSchema,
  }),
) {}
