import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const SkillQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  page_size: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().min(1).optional(),
  status: z.enum(['active', 'archived']).optional(),
  isBuiltin: z.coerce.boolean().optional(),
  sourceKind: z.enum(['manual', 'share_imported']).optional(),
  source_kind: z.enum(['manual', 'share_imported']).optional(),
}).transform((value) => ({
  page: value.page,
  pageSize: value.pageSize ?? value.page_size ?? 20,
  search: value.search,
  status: value.status,
  isBuiltin: value.isBuiltin,
  sourceKind: value.sourceKind ?? value.source_kind,
}));

export class SkillQueryDto extends createZodDto(SkillQuerySchema) {}

export type SkillQueryDtoType = z.infer<typeof SkillQuerySchema>;
