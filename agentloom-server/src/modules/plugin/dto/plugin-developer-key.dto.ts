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

export class QueryDeveloperKeysDto extends createZodDto(QueryDeveloperKeysSchema) {}

export const DeveloperKeyResponseSchema = RegisterDeveloperKeySchema.extend({
  id: z.uuid(),
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
export type QueryDeveloperKeysDtoType = z.infer<typeof QueryDeveloperKeysSchema>;
export type DeveloperKeyResponseDtoType = z.infer<
  typeof DeveloperKeyResponseSchema
>;
