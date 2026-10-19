import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// body 整体可省略：不带 body 的 POST /rebuild 等价于 {}。
export const RebuildKnowledgeBaseSchema = z
  .object({
    force: z.boolean().optional().default(true),
  })
  .optional()
  .default({ force: true });

export class RebuildKnowledgeBaseDto extends createZodDto(
  RebuildKnowledgeBaseSchema,
) {}
