import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const IsoDateTimeStringSchema = z
  .string()
  .datetime({ offset: true, message: 'Invalid ISO datetime' });
const IsoDateCoerceSchema = z
  .union([IsoDateTimeStringSchema, z.date()])
  .pipe(z.coerce.date());

const QueryPluginUsageDtoSchema = z.object({
  pluginId: z.string().trim().min(1).optional(),
  executionId: z.string().trim().min(1).optional(),
  startDate: IsoDateTimeStringSchema.optional(),
  endDate: IsoDateTimeStringSchema.optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const QueryPluginUsageSchema = QueryPluginUsageDtoSchema.extend({
  startDate: IsoDateCoerceSchema.optional(),
  endDate: IsoDateCoerceSchema.optional(),
});

export class QueryPluginUsageQueryDto extends createZodDto(
  QueryPluginUsageDtoSchema,
) {}

export type QueryPluginUsageQueryDtoType = z.infer<
  typeof QueryPluginUsageSchema
>;
