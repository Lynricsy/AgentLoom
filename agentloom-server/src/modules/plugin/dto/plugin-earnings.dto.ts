import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { NON_NEGATIVE_FIXED_SCALE_DECIMAL_REGEX } from '../fixed-scale-decimal';

export const PayoutStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
]);

const DecimalStringSchema = z
  .string()
  .trim()
  .regex(NON_NEGATIVE_FIXED_SCALE_DECIMAL_REGEX, {
    message: '必须为十进制数字字符串',
  });

const JsonbMetadataSchema = z.record(z.string(), z.unknown());
const IsoDatetimeSchema = z.iso.datetime();
const DashboardIntervalSchema = z.enum(['day', 'week', 'month']);

const DashboardDateRangeSchema = z.object({
  orgId: z.uuid().optional(),
  periodStart: IsoDatetimeSchema.optional(),
  periodEnd: IsoDatetimeSchema.optional(),
});

export const QueryPluginEarningsSchema = z.object({
  pluginId: z.string().trim().min(1).optional(),
  orgId: z.uuid().optional(),
  payoutStatus: PayoutStatusSchema.optional(),
  periodStart: IsoDatetimeSchema.optional(),
  periodEnd: IsoDatetimeSchema.optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export class QueryPluginEarningsDto extends createZodDto(
  QueryPluginEarningsSchema,
) {}

export const CreateEarningsRecordSchema = z
  .object({
    pluginDbId: z.uuid(),
    pluginId: z.string().trim().min(1),
    orgId: z.uuid(),
    sourceTenantId: z.uuid(),
    sourceOrgId: z.uuid(),
    sourcePluginDbId: z.uuid(),
    sourcePluginId: z.string().trim().min(1),
    sourceListingId: z.uuid().optional(),
    periodStart: IsoDatetimeSchema,
    periodEnd: IsoDatetimeSchema,
    totalExecutions: z.number().int().min(0),
    totalRevenue: DecimalStringSchema,
    developerShare: DecimalStringSchema,
    platformShare: DecimalStringSchema,
    listingCommission: DecimalStringSchema,
    currency: z.string().trim().min(1).max(10).optional().default('USD'),
    payoutStatus: PayoutStatusSchema.optional().default('pending'),
    metadata: JsonbMetadataSchema.optional(),
  })
  .strict();

export class CreateEarningsRecordDto extends createZodDto(
  CreateEarningsRecordSchema,
) {}

export const UpdatePayoutStatusSchema = z
  .object({
    payoutStatus: PayoutStatusSchema,
    payoutReference: z.string().trim().min(1).max(255).optional(),
  })
  .strict();

export class UpdatePayoutStatusDto extends createZodDto(
  UpdatePayoutStatusSchema,
) {}

export const QueryPluginEarningsSummarySchema =
  DashboardDateRangeSchema.strict();

export class QueryPluginEarningsSummaryDto extends createZodDto(
  QueryPluginEarningsSummarySchema,
) {}

export const QueryPluginEarningsTrendSchema = DashboardDateRangeSchema.extend({
  interval: DashboardIntervalSchema.optional().default('month'),
}).strict();

export class QueryPluginEarningsTrendDto extends createZodDto(
  QueryPluginEarningsTrendSchema,
) {}

export const QueryPluginEarningsRankingSchema = DashboardDateRangeSchema.extend(
  {
    limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  },
).strict();

export class QueryPluginEarningsRankingDto extends createZodDto(
  QueryPluginEarningsRankingSchema,
) {}

export const QueryPluginEarningsHistorySchema = DashboardDateRangeSchema.extend(
  {
    payoutStatus: PayoutStatusSchema.optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  },
).strict();

export class QueryPluginEarningsHistoryDto extends createZodDto(
  QueryPluginEarningsHistorySchema,
) {}

export type QueryPluginEarningsDtoType = z.infer<
  typeof QueryPluginEarningsSchema
>;
export type CreateEarningsRecordDtoType = z.infer<
  typeof CreateEarningsRecordSchema
>;
export type UpdatePayoutStatusDtoType = z.infer<
  typeof UpdatePayoutStatusSchema
>;
export type QueryPluginEarningsSummaryDtoType = z.infer<
  typeof QueryPluginEarningsSummarySchema
>;
export type QueryPluginEarningsTrendDtoType = z.infer<
  typeof QueryPluginEarningsTrendSchema
>;
export type QueryPluginEarningsRankingDtoType = z.infer<
  typeof QueryPluginEarningsRankingSchema
>;
export type QueryPluginEarningsHistoryDtoType = z.infer<
  typeof QueryPluginEarningsHistorySchema
>;
