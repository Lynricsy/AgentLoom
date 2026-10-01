import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { MAX_CONVERSATION_ATTACHMENT_BYTES } from '../../agent-conversation/conversation-attachment';

/** 对外接口请求与响应均为 camelCase，字段与 OpenAPI 契约一致 */

export const AGENT_API_MAX_PAGE_SIZE = 100;
export const AGENT_API_CONVERSATION_METADATA_MAX_BYTES = 16 * 1024;

/** 执行进程把运行时状态写在对话 metadata 的这些键下，调用方不可写入 */
export const AGENT_API_RESERVED_CONVERSATION_METADATA_KEYS = [
  'execution',
] as const;

export const AgentApiPageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  /** 超过上限时按上限处理，而不是报错（与契约一致） */
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .transform((value) => Math.min(value, AGENT_API_MAX_PAGE_SIZE))
    .default(20),
});

export type AgentApiPageQuery = z.infer<typeof AgentApiPageQuerySchema>;

export class AgentApiPageQuerySwaggerDto extends createZodDto(
  AgentApiPageQuerySchema,
) {}

export const AGENT_API_CONVERSATION_STATUSES = [
  'active',
  'ended',
  'failed',
] as const;

export const ListAgentApiConversationsQuerySchema =
  AgentApiPageQuerySchema.extend({
    externalUserId: z.string().min(1).max(255).optional(),
    status: z.enum(AGENT_API_CONVERSATION_STATUSES).optional(),
  });

export type ListAgentApiConversationsQuery = z.infer<
  typeof ListAgentApiConversationsQuerySchema
>;

export class ListAgentApiConversationsQuerySwaggerDto extends createZodDto(
  ListAgentApiConversationsQuerySchema,
) {}

export const CreateAgentApiConversationSchema = z
  .object({
    title: z.string().max(255).optional(),
    externalUserId: z.string().min(1).max(255).optional(),
    metadata: z
      .record(z.string(), z.unknown())
      .superRefine((metadata, ctx) => {
        for (const key of AGENT_API_RESERVED_CONVERSATION_METADATA_KEYS) {
          if (key in metadata) {
            ctx.addIssue({
              code: 'custom',
              message: `metadata.${key} is reserved`,
              path: [key],
            });
          }
        }

        if (
          Buffer.byteLength(JSON.stringify(metadata), 'utf8') >
          AGENT_API_CONVERSATION_METADATA_MAX_BYTES
        ) {
          ctx.addIssue({
            code: 'custom',
            message: `metadata must not exceed ${AGENT_API_CONVERSATION_METADATA_MAX_BYTES} bytes when serialized`,
          });
        }
      })
      .optional(),
  })
  .strict();

export type CreateAgentApiConversationDto = z.infer<
  typeof CreateAgentApiConversationSchema
>;

export class CreateAgentApiConversationSwaggerDto extends createZodDto(
  CreateAgentApiConversationSchema,
) {}

/**
 * 结构校验在此完成；大小与 image/file 内容组合等规则由写入消息时的
 * Studio 对话附件规则统一校验（见 conversation-attachment.ts）。
 */
export const AgentApiAttachmentSchema = z
  .object({
    kind: z.enum(['image', 'file']),
    fileName: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(255),
    sizeBytes: z
      .number()
      .int()
      .min(0)
      .max(MAX_CONVERSATION_ATTACHMENT_BYTES),
    dataBase64: z.string().min(1).optional(),
    textContent: z.string().min(1).optional(),
  })
  .strict();

export type AgentApiAttachmentInput = z.infer<typeof AgentApiAttachmentSchema>;

export const CreateAgentApiRunSchema = z
  .object({
    input: z
      .object({
        content: z.string().min(1).max(100_000),
        attachments: z.array(AgentApiAttachmentSchema).max(10).optional(),
      })
      .strict(),
  })
  .strict();

export type CreateAgentApiRunDto = z.infer<typeof CreateAgentApiRunSchema>;

export class CreateAgentApiRunSwaggerDto extends createZodDto(
  CreateAgentApiRunSchema,
) {}
