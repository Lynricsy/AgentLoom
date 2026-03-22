import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// --------------- Audit / Review ---------------

export const ListAuditLogQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
  })
  .transform((v) => ({
    page: v.page,
    pageSize: v.pageSize ?? v.page_size ?? 20,
  }));

export class ListAuditLogQueryDto extends createZodDto(
  ListAuditLogQuerySchema,
) {}

export const ReviewVersionSchema = z.object({
  action: z.enum(['approve', 'reject']),
});

export class ReviewVersionDto extends createZodDto(ReviewVersionSchema) {}

export const ListPendingReviewsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
  })
  .transform((v) => ({
    page: v.page,
    pageSize: v.pageSize ?? v.page_size ?? 20,
  }));

export class ListPendingReviewsQueryDto extends createZodDto(
  ListPendingReviewsQuerySchema,
) {}
