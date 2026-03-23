import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const SkillQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().min(1).optional(),
  status: z.enum(['active', 'archived']).optional(),
  isBuiltin: z.coerce.boolean().optional(),
});

export class SkillQueryDto extends createZodDto(SkillQuerySchema) {}

export type SkillQueryDtoType = z.infer<typeof SkillQuerySchema>;
