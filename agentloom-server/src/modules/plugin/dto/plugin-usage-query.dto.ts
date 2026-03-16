import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const ISO_DATETIME_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

const IsoDateCoerceSchema = z
  .union([
    z.string().refine(
      (value) =>
        ISO_DATETIME_REGEX.test(value) && !Number.isNaN(Date.parse(value)),
      'Invalid ISO datetime',
    ),
    z.date(),
  ])
  .pipe(z.coerce.date());

export const QueryPluginUsageSchema = z.object({
  pluginId: z.string().trim().min(1).optional(),
  executionId: z.string().trim().min(1).optional(),
  startDate: IsoDateCoerceSchema.optional(),
  endDate: IsoDateCoerceSchema.optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export class QueryPluginUsageQueryDto extends createZodDto(
  QueryPluginUsageSchema,
) {}

export type QueryPluginUsageQueryDtoType = z.infer<
  typeof QueryPluginUsageSchema
>;
