import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { MARKETPLACE_REVIEW_LIMITS } from '../../../database/schema';

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
});

export class QueryMyListingsDto extends createZodDto(QueryMyListingsSchema) {}
