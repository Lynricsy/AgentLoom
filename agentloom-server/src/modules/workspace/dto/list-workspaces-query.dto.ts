import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

function normalizeBooleanQuery(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return value;
}

export const ListWorkspacesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().max(200).optional(),
    includeAutoArchived: z.preprocess(
      normalizeBooleanQuery,
      z.boolean().optional(),
    ),
    include_auto_archived: z.preprocess(
      normalizeBooleanQuery,
      z.boolean().optional(),
    ),
  })
  .transform((v) => ({
    page: v.page,
    pageSize: v.pageSize ?? v.page_size ?? 20,
    search: v.search,
    includeAutoArchived:
      v.includeAutoArchived ?? v.include_auto_archived ?? true,
  }));

export class ListWorkspacesQueryDto extends createZodDto(
  ListWorkspacesQuerySchema,
) {}
