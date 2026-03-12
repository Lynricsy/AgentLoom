import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const WorkflowDefinitionSortSchema = z.preprocess((value) => {
  if (value === 'updated_at') {
    return 'updatedAt';
  }

  if (value === 'created_at') {
    return 'createdAt';
  }

  return value;
}, z.enum(['updatedAt', 'createdAt', 'name']));

export const ListWorkflowDefinitionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  search: z.string().max(255).optional(),
  sort: WorkflowDefinitionSortSchema.default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export class ListWorkflowDefinitionsQueryDto extends createZodDto(
  ListWorkflowDefinitionsQuerySchema,
) {}
