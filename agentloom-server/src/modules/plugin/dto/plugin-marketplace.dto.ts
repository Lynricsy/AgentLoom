import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import {
  marketplaceCategoryEnum,
  marketplaceListingStatusEnum,
  marketplacePricingModelEnum,
} from '../../../database/schema';

export const PluginMarketplaceCategorySchema = z.enum(
  marketplaceCategoryEnum.enumValues,
);

export const PluginMarketplaceListingStatusSchema = z.enum(
  marketplaceListingStatusEnum.enumValues,
);

export const PluginMarketplacePricingModelSchema = z.enum(
  marketplacePricingModelEnum.enumValues,
);

const PricePerExecutionSchema = z
  .string()
  .trim()
  .min(1, { message: 'pricePerExecution 不能为空' })
  .regex(/^\d+(\.\d{1,8})?$/, {
    message: 'pricePerExecution 必须为非负数字字符串，最多 8 位小数',
  });

const UuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    {
      message: '必须是合法的 UUID',
    },
  );

const SubmitPluginListingSchemaBase = z
  .object({
    pluginDbId: UuidSchema,
    title: z.string().trim().min(3).max(200),
    summary: z.string().trim().min(10).max(1000),
    description: z.string().trim().max(10_000).optional(),
    category: PluginMarketplaceCategorySchema.optional(),
    tags: z.array(z.string().trim().min(1)).max(10).optional(),
    pricingModel: PluginMarketplacePricingModelSchema,
    pricePerExecution: PricePerExecutionSchema.optional(),
  })
  .strict();

export const SubmitPluginListingSchema = SubmitPluginListingSchemaBase.refine(
  (value) =>
    value.pricingModel !== 'per_execution' ||
    value.pricePerExecution !== undefined,
  {
    message: 'pricingModel 为 per_execution 时必须提供 pricePerExecution',
    path: ['pricePerExecution'],
  },
);

export class SubmitPluginListingDto extends createZodDto(
  SubmitPluginListingSchema,
) {}

export const UpdatePluginListingSchema = SubmitPluginListingSchemaBase.partial()
  .extend({
    occVersion: z.number().int().min(1).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.pricingModel !== 'per_execution' ||
      value.pricePerExecution !== undefined,
    {
      message: 'pricingModel 为 per_execution 时必须提供 pricePerExecution',
      path: ['pricePerExecution'],
    },
  );

export class UpdatePluginListingDto extends createZodDto(
  UpdatePluginListingSchema,
) {}

export const QueryPluginListingsSchema = z.object({
  status: PluginMarketplaceListingStatusSchema.optional(),
  pricingModel: PluginMarketplacePricingModelSchema.optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export class QueryPluginListingsDto extends createZodDto(
  QueryPluginListingsSchema,
) {}

export type PluginMarketplaceCategoryDto = z.infer<
  typeof PluginMarketplaceCategorySchema
>;
export type PluginMarketplaceListingStatusDto = z.infer<
  typeof PluginMarketplaceListingStatusSchema
>;
export type PluginMarketplacePricingModelDto = z.infer<
  typeof PluginMarketplacePricingModelSchema
>;
export type SubmitPluginListingDtoType = z.infer<
  typeof SubmitPluginListingSchema
>;
export type UpdatePluginListingDtoType = z.infer<
  typeof UpdatePluginListingSchema
>;
export type QueryPluginListingsDtoType = z.infer<
  typeof QueryPluginListingsSchema
>;
