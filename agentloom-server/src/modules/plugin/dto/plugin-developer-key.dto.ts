import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const DeveloperKeyStatusSchema = z.enum(['active', 'revoked']);

export const RegisterDeveloperKeySchema = z.object({
  publicKey: z.string().min(1, '公钥不能为空。'),
  label: z.string().max(255).optional(),
});

export class RegisterDeveloperKeyDto extends createZodDto(
  RegisterDeveloperKeySchema,
) {}

export const QueryDeveloperKeysSchema = z.object({
  status: DeveloperKeyStatusSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export class QueryDeveloperKeysDto extends createZodDto(
  QueryDeveloperKeysSchema,
) {}

// 响应形状不能直接继承请求 schema 的 label：控制器返回的是原始 drizzle 行，
// plugin_developer_keys.label 是可空 varchar，wire 上实际会出现 null。
export const DeveloperKeyResponseSchema = RegisterDeveloperKeySchema.omit({
  label: true,
}).extend({
  id: z.uuid(),
  label: z.string().max(255).nullable(),
  keyFingerprint: z.string(),
  status: DeveloperKeyStatusSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  revokedAt: z.string().datetime({ offset: true }).nullable(),
});

export class DeveloperKeyResponseDto extends createZodDto(
  DeveloperKeyResponseSchema,
) {}

export type DeveloperKeyStatusDto = z.infer<typeof DeveloperKeyStatusSchema>;
export type RegisterDeveloperKeyDtoType = z.infer<
  typeof RegisterDeveloperKeySchema
>;
export type QueryDeveloperKeysDtoType = z.infer<
  typeof QueryDeveloperKeysSchema
>;
export type DeveloperKeyResponseDtoType = z.infer<
  typeof DeveloperKeyResponseSchema
>;
