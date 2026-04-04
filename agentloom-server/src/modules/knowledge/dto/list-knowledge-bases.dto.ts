import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const PageSizeSchema = z.coerce.number().int().min(1).max(100).optional();

export const ListKnowledgeBasesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: PageSizeSchema,
    page_size: PageSizeSchema,
    sourceKind: z.enum(['manual', 'share_imported']).optional(),
    source_kind: z.enum(['manual', 'share_imported']).optional(),
  })
  .transform((value) => ({
    page: value.page,
    pageSize: value.pageSize ?? value.page_size ?? 20,
    sourceKind: value.sourceKind ?? value.source_kind,
  }));

export class ListKnowledgeBasesQueryDto extends createZodDto(
  ListKnowledgeBasesQuerySchema,
) {}
