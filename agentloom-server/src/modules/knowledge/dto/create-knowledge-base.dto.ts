import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const CreateKnowledgeBaseSchema = z.object({
  name: z
    .string()
    .min(1, '名称不能为空')
    .max(255, '名称最长 255 个字符'),
  description: z.string().max(2000, '描述最长 2000 个字符').optional(),
  visibility: z.enum(['private', 'organization']).default('private'),
});

export class CreateKnowledgeBaseDto extends createZodDto(
  CreateKnowledgeBaseSchema,
) {}
