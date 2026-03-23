import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const SkillFrontmatterSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    license: z.string().optional(),
    compatibility: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    allowedTools: z.array(z.string()).optional(),
    disableModelInvocation: z.boolean().optional(),
  })
  .passthrough();

export const SkillResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  content: z.string().nullable(),
  frontmatter: SkillFrontmatterSchema.nullable(),
  isBuiltin: z.boolean(),
  status: z.enum(['active', 'archived']),
  fileCount: z.number().int(),
  totalSizeBytes: z.number().int(),
  version: z.number().int(),
  createdBy: z.string(),
  updatedBy: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export class SkillResponseDto extends createZodDto(SkillResponseSchema) {}

export type SkillResponseDtoType = z.infer<typeof SkillResponseSchema>;
