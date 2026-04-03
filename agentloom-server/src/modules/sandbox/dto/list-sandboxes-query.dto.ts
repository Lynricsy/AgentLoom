import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const PageSizeSchema = z.coerce.number().int().min(1).max(100).optional();

export const listSandboxesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: PageSizeSchema,
    page_size: PageSizeSchema,
    status: z
      .enum(['creating', 'ready', 'busy', 'stopping', 'stopped', 'failed'])
      .optional(),
    lifecycleMode: z.enum(['session', 'persistent']).optional(),
    lifecycle_mode: z.enum(['session', 'persistent']).optional(),
    bindingType: z.enum(['conversation', 'execution', 'resource']).optional(),
    binding_type: z.enum(['conversation', 'execution', 'resource']).optional(),
    search: z.string().optional(),
  })
  .transform((value) => ({
    page: value.page,
    pageSize: value.pageSize ?? value.page_size ?? 20,
    status: value.status,
    lifecycleMode: value.lifecycleMode ?? value.lifecycle_mode,
    bindingType: value.bindingType ?? value.binding_type,
    search: value.search,
  }));

export class ListSandboxesQueryDto extends createZodDto(
  listSandboxesQuerySchema,
) {}
