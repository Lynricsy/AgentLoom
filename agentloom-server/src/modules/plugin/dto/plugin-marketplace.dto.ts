import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import {
  MARKETPLACE_REVIEW_LIMITS,
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

// 平台主键是 UUIDv7（uuid_generate_v7 / uuidv7()），版本位为 7。
// 这里必须用与其余 DTO 一致的 z.uuid()：手写 [1-5] 版本位的正则会把
// 所有真实 pluginDbId 判成非法 UUID，导致合法插件永远无法上架。
const UuidSchema = z.string().uuid('必须是合法的 UUID');

/**
 * 文本限制与 `MARKETPLACE_REVIEW_LIMITS` 对齐，
 * 避免 DTO 接受必然 review_failed 的内容。
 */
const SubmitPluginListingSchemaBase = z
  .object({
    pluginDbId: UuidSchema,
    title: z
      .string()
      .trim()
      .min(MARKETPLACE_REVIEW_LIMITS.titleMinLength)
      .max(MARKETPLACE_REVIEW_LIMITS.titleMaxLength),
    summary: z
      .string()
      .trim()
      .min(MARKETPLACE_REVIEW_LIMITS.summaryMinLength)
      .max(MARKETPLACE_REVIEW_LIMITS.summaryMaxLength),
    category: PluginMarketplaceCategorySchema.optional(),
    tags: z
      .array(
        z.string().trim().min(1).max(MARKETPLACE_REVIEW_LIMITS.tagMaxLength),
      )
      .min(MARKETPLACE_REVIEW_LIMITS.minTags)
      .max(MARKETPLACE_REVIEW_LIMITS.maxTags),
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
