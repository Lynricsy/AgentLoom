import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const PageSizeSchema = z.coerce.number().int().min(1).max(100).optional();

function normalizeBooleanQuery(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }
  }

  return value;
}

export const listNotificationsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: PageSizeSchema,
    pageSize: PageSizeSchema,
    page_size: PageSizeSchema,
    isRead: z.preprocess(normalizeBooleanQuery, z.boolean().optional()),
    is_read: z.preprocess(normalizeBooleanQuery, z.boolean().optional()),
  })
  .transform((value) => ({
    page: value.page,
    pageSize: value.limit ?? value.pageSize ?? value.page_size ?? 20,
    isRead: value.isRead ?? value.is_read,
  }));

export class ListNotificationsQueryDto extends createZodDto(
  listNotificationsQuerySchema,
) {}
