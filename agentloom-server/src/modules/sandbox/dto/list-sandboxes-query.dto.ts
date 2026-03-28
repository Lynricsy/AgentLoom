import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const PageSizeSchema = z.coerce.number().int().min(1).max(100).optional();

export const listSandboxesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: PageSizeSchema,
    status: z
      .enum(['creating', 'ready', 'busy', 'stopping', 'stopped', 'failed'])
      .optional(),
    lifecycleMode: z.enum(['session', 'persistent']).optional(),
    search: z.string().optional(),
  })
  .transform((value) => ({
    page: value.page,
    pageSize: value.pageSize ?? 20,
    status: value.status,
    lifecycleMode: value.lifecycleMode,
    search: value.search,
  }));

export class ListSandboxesQueryDto extends createZodDto(
  listSandboxesQuerySchema,
) {}
