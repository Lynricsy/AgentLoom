import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const PageLimitSchema = z.coerce.number().int().min(1).max(100).optional();

export const listExecutionsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: PageLimitSchema,
    pageSize: PageLimitSchema,
    page_size: PageLimitSchema,
    status: z
      .enum([
        'pending',
        'running',
        'paused',
        'completed',
        'failed',
        'cancelled',
      ])
      .optional(),
  })
  .transform((value) => ({
    page: value.page,
    limit: value.limit ?? value.pageSize ?? value.page_size ?? 20,
    status: value.status,
  }));

export class ListExecutionsQueryDto extends createZodDto(
  listExecutionsQuerySchema,
) {}
