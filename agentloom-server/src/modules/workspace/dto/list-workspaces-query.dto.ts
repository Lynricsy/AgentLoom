import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ListWorkspacesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().max(200).optional(),
    includeAutoArchived: z.coerce.boolean().optional(),
    include_auto_archived: z.coerce.boolean().optional(),
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
