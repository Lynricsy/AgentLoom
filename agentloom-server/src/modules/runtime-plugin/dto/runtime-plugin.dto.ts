import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const RuntimePluginStatusSchema = z.enum([
  'registered',
  'active',
  'disabled',
]);

export const RegisterRuntimePluginSchema = z
  .object({
    status: z.enum(['registered', 'active']).default('registered'),
  })
  .strict();

export class RegisterRuntimePluginDto extends createZodDto(
  RegisterRuntimePluginSchema,
) {}

export const QueryRuntimePluginsSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().min(1).optional(),
  status: RuntimePluginStatusSchema.optional(),
});

export class QueryRuntimePluginsDto extends createZodDto(
  QueryRuntimePluginsSchema,
) {}

export const UpdateRuntimePluginStatusSchema = z
  .object({
    status: RuntimePluginStatusSchema,
    occVersion: z.number().int().min(1, { message: 'occVersion 必须为正整数' }),
  })
  .strict();

export class UpdateRuntimePluginStatusDto extends createZodDto(
  UpdateRuntimePluginStatusSchema,
) {}

/** 对外响应：不含 storageKey / signature / bundlePatch / manifest 等内部字段。 */
export const RuntimePluginResponseSchema = z.object({
  id: z.string().uuid(),
  pluginId: z.string(),
  name: z.string(),
  version: z.string(),
  author: z.string(),
  description: z.string().nullable(),
  license: z.string().nullable(),
  status: RuntimePluginStatusSchema,
  configSchema: z.record(z.string(), z.unknown()).nullable(),
  sizeBytes: z.number().int(),
  contentHash: z.string(),
  installedBy: z.string().uuid().nullable(),
  occVersion: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export class RuntimePluginResponseDto extends createZodDto(
  RuntimePluginResponseSchema,
) {}

export const RuntimePluginEnvelopeSchema = z.object({
  data: RuntimePluginResponseSchema,
});

export class RuntimePluginEnvelopeDto extends createZodDto(
  RuntimePluginEnvelopeSchema,
) {}

export const RuntimePluginListResponseSchema = z.object({
  data: z.array(RuntimePluginResponseSchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export class RuntimePluginListResponseDto extends createZodDto(
  RuntimePluginListResponseSchema,
) {}

export type RuntimePluginStatusDto = z.infer<typeof RuntimePluginStatusSchema>;
export type RegisterRuntimePluginDtoType = z.infer<
  typeof RegisterRuntimePluginSchema
>;
export type QueryRuntimePluginsDtoType = z.infer<
  typeof QueryRuntimePluginsSchema
>;
export type RuntimePluginResponse = z.infer<typeof RuntimePluginResponseSchema>;
