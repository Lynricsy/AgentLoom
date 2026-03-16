import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const PayoutStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
]);

const DecimalStringSchema = z.string().trim().regex(/^\d+(\.\d+)?$/, {
  message: '必须为十进制数字字符串',
});

const JsonbMetadataSchema = z.record(z.string(), z.unknown());
const IsoDatetimeSchema = z.iso.datetime();

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
    payoutAt: IsoDatetimeSchema.optional(),
  })
  .strict();

export class UpdatePayoutStatusDto extends createZodDto(
  UpdatePayoutStatusSchema,
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
