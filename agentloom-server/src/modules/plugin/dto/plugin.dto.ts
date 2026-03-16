import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const PluginStatusSchema = z.enum([
  'registered',
  'active',
  'disabled',
  'error',
]);

export const RegisterPluginSchema = z
  .object({
    status: PluginStatusSchema.optional().default('registered'),
  })
  .strict();

export class RegisterPluginDto extends createZodDto(RegisterPluginSchema) {}

export const QueryPluginsSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().min(1).optional(),
  status: PluginStatusSchema.optional(),
});

export class QueryPluginsDto extends createZodDto(QueryPluginsSchema) {}

export const UpdatePluginStatusSchema = z
  .object({
    status: PluginStatusSchema,
    occVersion: z.number().int().min(1, { message: 'occVersion 必须为正整数' }),
  })
  .strict();

export class UpdatePluginStatusDto extends createZodDto(
  UpdatePluginStatusSchema,
) {}

export type PluginStatusDto = z.infer<typeof PluginStatusSchema>;
export type RegisterPluginDtoType = z.infer<typeof RegisterPluginSchema>;
export type QueryPluginsDtoType = z.infer<typeof QueryPluginsSchema>;
export type UpdatePluginStatusDtoType = z.infer<
  typeof UpdatePluginStatusSchema
>;
