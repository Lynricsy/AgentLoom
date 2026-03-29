import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const RebuildKnowledgeBaseSchema = z.object({
  force: z.boolean().optional().default(true),
});

export class RebuildKnowledgeBaseDto extends createZodDto(
  RebuildKnowledgeBaseSchema,
) {}
