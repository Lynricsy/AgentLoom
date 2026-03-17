import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import {
  MARKETPLACE_REVIEW_LIMITS,
  marketplaceCategoryEnum,
} from '../../../database/schema';

const MarketplaceCategorySchema = z.enum(marketplaceCategoryEnum.enumValues);

export const SubmitMarketplaceListingSchema = z.object({
  workflowVersionId: z.string().uuid(),
  title: z
    .string()
    .trim()
    .min(MARKETPLACE_REVIEW_LIMITS.titleMinLength, {
      message: `标题至少 ${MARKETPLACE_REVIEW_LIMITS.titleMinLength} 个字符`,
    })
    .max(MARKETPLACE_REVIEW_LIMITS.titleMaxLength, {
      message: `标题最多 ${MARKETPLACE_REVIEW_LIMITS.titleMaxLength} 个字符`,
    }),
  summary: z
    .string()
    .trim()
    .min(MARKETPLACE_REVIEW_LIMITS.summaryMinLength, {
      message: `摘要至少 ${MARKETPLACE_REVIEW_LIMITS.summaryMinLength} 个字符`,
    })
    .max(MARKETPLACE_REVIEW_LIMITS.summaryMaxLength, {
      message: `摘要最多 ${MARKETPLACE_REVIEW_LIMITS.summaryMaxLength} 个字符`,
    }),
  tags: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(MARKETPLACE_REVIEW_LIMITS.tagMaxLength, {
          message: `单个标签最多 ${MARKETPLACE_REVIEW_LIMITS.tagMaxLength} 个字符`,
        }),
    )
    .min(MARKETPLACE_REVIEW_LIMITS.minTags, {
      message: `至少需要 ${MARKETPLACE_REVIEW_LIMITS.minTags} 个标签`,
    })
    .max(MARKETPLACE_REVIEW_LIMITS.maxTags, {
      message: `最多 ${MARKETPLACE_REVIEW_LIMITS.maxTags} 个标签`,
    }),
  coverImageUrl: z.string().url().optional(),
  category: MarketplaceCategorySchema.optional(),
});

export class SubmitMarketplaceListingDto extends createZodDto(
  SubmitMarketplaceListingSchema,
) {}

export const QueryMyListingsSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z
    .enum(['pending_review', 'review_failed', 'listed', 'unlisted'])
    .optional(),
  listingType: z.enum(['workflow', 'plugin']).optional(),
});

export class QueryMyListingsDto extends createZodDto(QueryMyListingsSchema) {}

export const QueryPublicListingsSchema = z.object({
  category: MarketplaceCategorySchema.optional(),
  search: z.string().trim().max(200).optional(),
  listingType: z.enum(['workflow', 'plugin']).optional(),
  sort: z.enum(['popular', 'rating', 'newest']).default('popular'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export class QueryPublicListingsDto extends createZodDto(
  QueryPublicListingsSchema,
) {}

export const QueryPublicReviewsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export class QueryPublicReviewsDto extends createZodDto(
  QueryPublicReviewsSchema,
) {}

export const InstallMarketplaceListingSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2000).optional(),
});

export class InstallMarketplaceListingDto extends createZodDto(
  InstallMarketplaceListingSchema,
) {}

export const SubmitReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  content: z.string().trim().max(2000).optional(),
});

export class SubmitReviewDto extends createZodDto(SubmitReviewSchema) {}
