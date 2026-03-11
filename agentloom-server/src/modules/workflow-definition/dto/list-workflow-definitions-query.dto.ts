import { createZodDto } from '@anatine/zod-nestjs';
import { z } from 'zod';

export const ListWorkflowDefinitionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  search: z.string().max(255).optional(),
  sort: z.enum(['updatedAt', 'createdAt', 'name']).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export class ListWorkflowDefinitionsQueryDto extends createZodDto(
  ListWorkflowDefinitionsQuerySchema,
) {}
