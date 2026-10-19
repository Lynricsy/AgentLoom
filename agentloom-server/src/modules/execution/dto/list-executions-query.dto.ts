import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const PageLimitSchema = z.coerce.number().int().min(1).max(100).optional();
const WorkflowVersionIdSchema = z.string().uuid().optional();
const DefinitionSourceSchema = z.enum(['version', 'draft']).optional();

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
    // 按版本筛选只命中运行该版本快照的执行；草稿运行没有版本，不会出现在任何版本下
    workflowVersionId: WorkflowVersionIdSchema,
    workflow_version_id: WorkflowVersionIdSchema,
    definitionSource: DefinitionSourceSchema,
    definition_source: DefinitionSourceSchema,
  })
  .transform((value) => ({
    page: value.page,
    limit: value.limit ?? value.pageSize ?? value.page_size ?? 20,
    status: value.status,
    workflowVersionId: value.workflowVersionId ?? value.workflow_version_id,
    definitionSource: value.definitionSource ?? value.definition_source,
  }));

export class ListExecutionsQueryDto extends createZodDto(
  listExecutionsQuerySchema,
) {}
