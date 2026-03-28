import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ListWorkspacesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().max(200).optional(),
  })
  .transform((v) => ({
    page: v.page,
    pageSize: v.pageSize ?? v.page_size ?? 20,
    search: v.search,
  }));

export class ListWorkspacesQueryDto extends createZodDto(
  ListWorkspacesQuerySchema,
) {}
