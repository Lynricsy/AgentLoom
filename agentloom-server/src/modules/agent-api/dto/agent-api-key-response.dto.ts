import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const IsoDatetimeSchema = z.iso.datetime({ offset: true });

/** 管理接口响应为 camelCase，字段与 OpenAPI `AgentApiKey` 一致 */
export const AgentApiKeySwaggerSchema = z.object({
  id: z.uuid(),
  agentDefinitionId: z.uuid(),
  name: z.string(),
  keyPrefix: z.string().regex(/^alak_[0-9a-f]{8}$/),
  rateLimitPerMinute: z.number().int().nullable(),
  maxConcurrentRuns: z.number().int(),
  lastUsedAt: IsoDatetimeSchema.nullable(),
  expiresAt: IsoDatetimeSchema.nullable(),
  revokedAt: IsoDatetimeSchema.nullable(),
  createdAt: IsoDatetimeSchema,
});

export const AgentApiKeyWithSecretSwaggerSchema =
  AgentApiKeySwaggerSchema.extend({
    /** 明文 key，仅创建响应返回一次 */
    key: z.string().regex(/^alak_[0-9a-f]{64}$/),
  });

export type AgentApiKeyResponse = z.infer<typeof AgentApiKeySwaggerSchema>;
export type AgentApiKeyWithSecret = z.infer<
  typeof AgentApiKeyWithSecretSwaggerSchema
>;

export const AgentApiKeyPageMetaSwaggerSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  total: z.number().int().min(0),
});

export const AgentApiKeyCreateEnvelopeSwaggerSchema = z.object({
  data: AgentApiKeyWithSecretSwaggerSchema,
});

export const AgentApiKeyListResponseSwaggerSchema = z.object({
  data: z.array(AgentApiKeySwaggerSchema),
  meta: AgentApiKeyPageMetaSwaggerSchema,
});

export type AgentApiKeyListResponse = z.infer<
  typeof AgentApiKeyListResponseSwaggerSchema
>;

export class AgentApiKeyCreateEnvelopeSwaggerDto extends createZodDto(
  AgentApiKeyCreateEnvelopeSwaggerSchema,
) {}

export class AgentApiKeyListResponseSwaggerDto extends createZodDto(
  AgentApiKeyListResponseSwaggerSchema,
) {}
